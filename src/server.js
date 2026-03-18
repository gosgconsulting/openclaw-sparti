/**
 * OpenClaw Railway Template - Wrapper Server
 *
 * Express server that:
 * 1. Exposes health check endpoints (no auth required)
 * 2. Protects /onboard with Supabase auth (/auth)
 * 3. Provides web terminal for `openclaw onboard` wizard
 * 4. Spawns and monitors OpenClaw gateway process
 * 5. Reverse proxies traffic to the gateway
 * 6. Handles WebSocket upgrades
 * 7. Provides /onboard/export for backups
 */

import express from 'express';
import { createServer } from 'http';
import { createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, createWriteStream, readdirSync, lstatSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import JSZip from 'jszip';
import archiver from 'archiver';
import { siAnthropic, siGooglegemini, siOpenrouter, siVercel, siCloudflare, siOllama } from 'simple-icons';
import { CHANNEL_GROUPS, buildChannelConfig, getChannelIcon, getRequiredPlugin } from './channels.js';
import { validate, migrateConfig, getAllSchemas } from './schema/index.js';

import healthRouter, { setGatewayReady } from './health.js';
import { startGateway, stopGateway, isGatewayRunning, getGatewayInfo, getGatewayToken, runCmd, runExec, deleteConfig, getRecentLogs, getGatewayUptime } from './gateway.js';
import { gatewayRPC } from './gateway-rpc.js';
import { createProxy } from './proxy.js';
import { createTerminalServer, closeAllSessions } from './terminal.js';
import { getSetupPageHTML } from './onboard-page.js';
import { getUIPageHTML } from './ui-page.js';
import { getAuthPageHTML } from './auth-page.js';
import { getDashboardPageHTML } from './dashboard-page.js';
import { createSupabaseClient, createSupabaseAdminClient } from './supabase.js';
import { requireUser, setSupabaseAuthCookies, clearSupabaseAuthCookies, getSupabaseTokensFromRequest, OC_RETURN_COOKIE } from './auth-supabase.js';
import missionControlRouter from './routes/mission-control.js';
import spartiContextRouter from './routes/sparti-context.js';
import { emitAudit } from './audit.js';
import {
  listComposioAuthConfigs,
  generateConnectLink,
  initiateComposioConnection,
  listComposioConnectedAccounts,
  listConnectedAccountsV3,
  disconnectComposioAccount,
  connectWithApiKey,
} from './integrations/composio.js';

// Configuration
const PORT = process.env.PORT || 8080;
const OPENCLAW_STATE_DIR = process.env.OPENCLAW_STATE_DIR || '/data/.openclaw';

function getOptionalEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function parseOptionalInt(value, fallback) {
  const n = parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}


/**
 * SaaS mode bootstrap: create openclaw.json from LLM Gateway env vars if missing.
 * This avoids the interactive /onboard wizard for end-users.
 */
async function getSharedLlmGatewayConfigFromSupabase() {
  // Optional fallback. Only works if you provide SUPABASE_SERVICE_ROLE_KEY
  // and you have a table to store global settings.
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const admin = createSupabaseAdminClient();

    // Expected schema (recommended):
    // public.app_settings(key text primary key, value jsonb not null)
    // Row: key='llm_gateway', value={ base_url, api_key, model_id, provider_id?, context_window?, max_tokens? }
    const { data, error } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'llm_gateway')
      .maybeSingle();

    if (error || !data?.value) return null;
    const v = data.value;
    if (!v || typeof v !== 'object') return null;

    return {
      baseUrl: String(v.base_url || v.baseUrl || '').trim(),
      apiKey: String(v.api_key || v.apiKey || '').trim(),
      modelId: String(v.model_id || v.modelId || '').trim(),
      providerId: String(v.provider_id || v.providerId || '').trim(),
      contextWindow: v.context_window ?? v.contextWindow,
      maxTokens: v.max_tokens ?? v.maxTokens,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the shared Composio API key.
 * Priority: COMPOSIO_API_KEY env var → app_settings(key='composio').api_key in Supabase.
 * One key is shared across all users on this server; individual user OAuth sessions
 * are scoped by user_id passed to composio.create(userId).
 */
async function getComposioApiKey() {
  const fromEnv = getOptionalEnv('COMPOSIO_API_KEY');
  if (fromEnv) return fromEnv;

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return '';
    const admin = createSupabaseAdminClient();
    // Expected row: app_settings(key='composio', value={"api_key":"..."})
    const { data, error } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'composio')
      .maybeSingle();
    if (error || !data?.value) return '';
    const key = String(data.value?.api_key || data.value?.apiKey || '').trim();
    return key;
  } catch {
    return '';
  }
}

async function ensureOpenClawConfigFromEnv() {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  if (existsSync(configFile)) return { configured: true, created: false };

  let baseUrl = getOptionalEnv('LLM_GATEWAY_BASE_URL');
  let apiKey = getOptionalEnv('LLM_GATEWAY_API_KEY');
  let modelId = getOptionalEnv('LLM_GATEWAY_MODEL_ID');
  let providerId = getOptionalEnv('LLM_GATEWAY_PROVIDER_ID') || 'llm-gateway';
  let contextWindowRaw = getOptionalEnv('LLM_GATEWAY_CONTEXT_WINDOW');
  let maxTokensRaw = getOptionalEnv('LLM_GATEWAY_MAX_TOKENS');

  if (!baseUrl || !apiKey || !modelId) {
    const fromDb = await getSharedLlmGatewayConfigFromSupabase();
    if (fromDb?.baseUrl && fromDb?.apiKey && fromDb?.modelId) {
      baseUrl = fromDb.baseUrl;
      apiKey = fromDb.apiKey;
      modelId = fromDb.modelId;
      providerId = fromDb.providerId || providerId;
      if (fromDb.contextWindow != null) contextWindowRaw = String(fromDb.contextWindow);
      if (fromDb.maxTokens != null) maxTokensRaw = String(fromDb.maxTokens);
    }
  }

  if (!baseUrl || !apiKey || !modelId) {
    return {
      configured: false,
      created: false,
      reason: 'Missing shared LLM Gateway config. Set LLM_GATEWAY_* env vars OR store it in Supabase app_settings(key=llm_gateway).',
    };
  }

  const contextWindow = parseOptionalInt(contextWindowRaw, 200000);
  const maxTokens = parseOptionalInt(maxTokensRaw, 4096);

  const config = {
    models: {
      providers: {
        [providerId]: {
          baseUrl,
          api: 'openai-completions',
          apiKey,
          models: [
            {
              id: modelId,
              contextWindow,
              maxTokens,
            }
          ],
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: `${providerId}/${modelId}`,
        },
      },
    },
    channels: {},
  };

  // Validate to avoid writing invalid config shapes.
  const result = validate(config);
  if (!result.valid) {
    return { configured: false, created: false, reason: 'Generated config failed validation' };
  }

  mkdirSync(OPENCLAW_STATE_DIR, { recursive: true });
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  return { configured: true, created: true };
}

// Custom SVG paths for providers not in simple-icons (viewBox 0 0 24 24)
const CUSTOM_ICONS = {
  'OpenAI': {
    svg: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4114-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0974-2.3616l2.603-1.5018 2.6032 1.5018v3.0036l-2.6032 1.5018-2.603-1.5018z',
    color: '#412991'
  },
  'Venice AI': {
    svg: 'M12 2L2 22h4l6-14 6 14h4L12 2z',
    color: '#7C3AED'
  },
  'Together AI': {
    svg: 'M4 4h16v4H14v14h-4V8H4V4z',
    color: '#0EA5E9'
  },
  'Moonshot AI': {
    svg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.82 0 3.53-.49 5-1.35A8 8 0 0 1 10 12a8 8 0 0 1 7-7.93A9.96 9.96 0 0 0 12 2z',
    color: '#6366F1'
  },
  'Kimi Coding': {
    svg: 'M6 3v18h4v-7l6 7h5l-7.5-8.5L20 3h-5l-5 6V3H6z',
    color: '#F59E0B'
  },
  'Z.AI (GLM)': {
    svg: 'M4 4h16v4l-10.5 8H20v4H4v-4l10.5-8H4V4z',
    color: '#3B82F6'
  },
  'Custom Provider': {
    svg: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    color: '#a78bfa'
  }
};

// Map provider display names to simple-icons objects
const SIMPLE_ICONS_MAP = {
  'Anthropic': siAnthropic,
  'Google / Gemini': siGooglegemini,
  'OpenRouter': siOpenrouter,
  'Vercel AI Gateway': siVercel,
  'Cloudflare AI Gateway': siCloudflare,
  'Ollama': siOllama
};

// Look up icon data for a provider by display name
function getProviderIcon(name) {
  const si = SIMPLE_ICONS_MAP[name];
  if (si) return { svg: si.path, color: '#' + si.hex };
  const custom = CUSTOM_ICONS[name];
  if (custom) return { svg: custom.svg, color: custom.color };
  return null;
}

// Auth provider groups for the simple mode form
const AUTH_GROUPS = [
  // === Popular ===
  {
    provider: 'Anthropic',
    category: 'popular',
    description: 'Claude Opus, Sonnet, Haiku',
    emoji: '\u{1F9E0}',
    options: [
      { label: 'API Key', value: 'anthropic-api-key', flag: '--anthropic-api-key' },
      { label: 'Setup Token', value: 'setup-token',
        flag: ['--auth-choice', 'token', '--token-provider', 'anthropic'],
        secretFlag: '--token' }
    ]
  },
  {
    provider: 'OpenAI',
    category: 'popular',
    description: 'GPT-4o, o1, o3, DALL-E',
    emoji: '\u{1F916}',
    options: [
      { label: 'API Key', value: 'openai-api-key', flag: '--openai-api-key' },
      { label: 'Codex Subscription', value: 'openai-codex',
        flag: ['--auth-choice', 'openai-codex'],
        noSecret: true }
    ]
  },
  {
    provider: 'Google / Gemini',
    category: 'popular',
    description: 'Gemini Pro, Flash, Ultra',
    emoji: '\u{2728}',
    options: [
      { label: 'API Key', value: 'gemini-api-key', flag: '--gemini-api-key' }
    ]
  },
  {
    provider: 'OpenRouter',
    category: 'popular',
    description: 'Multi-provider gateway',
    emoji: '\u{1F310}',
    options: [
      { label: 'API Key', value: 'openrouter-api-key', flag: '--openrouter-api-key' }
    ]
  },
  // === More Providers ===
  {
    provider: 'MiniMax',
    category: 'more',
    description: 'MiniMax M2.1 models',
    emoji: '\u{1F4A1}',
    options: [
      { label: 'API Key', value: 'minimax-api-key',
        flag: ['--auth-choice', 'minimax-api-key'],
        secretFlag: '--minimax-api-key' },
      { label: 'Coding Plan (OAuth)', value: 'minimax-portal',
        flag: ['--auth-choice', 'minimax-portal'],
        noSecret: true }
    ]
  },
  {
    provider: 'Venice AI',
    category: 'more',
    description: 'Privacy-focused AI inference',
    emoji: '\u{1F3AD}',
    options: [
      { label: 'API Key', value: 'venice-api-key',
        flag: ['--auth-choice', 'venice-api-key'],
        secretFlag: '--venice-api-key' }
    ]
  },
  {
    provider: 'Together AI',
    category: 'more',
    description: 'Open-source model hosting',
    emoji: '\u{1F91D}',
    options: [
      { label: 'API Key', value: 'together-api-key',
        flag: ['--auth-choice', 'together-api-key'],
        secretFlag: '--together-api-key' }
    ]
  },
  {
    provider: 'Vercel AI Gateway',
    category: 'more',
    description: 'Edge AI inference gateway',
    emoji: '\u25B2',
    options: [
      { label: 'API Key', value: 'ai-gateway-api-key',
        flag: ['--auth-choice', 'ai-gateway-api-key'],
        secretFlag: '--ai-gateway-api-key' }
    ]
  },
  {
    provider: 'Moonshot AI',
    category: 'more',
    description: 'Kimi large language models',
    emoji: '\u{1F319}',
    options: [
      { label: 'API Key', value: 'moonshot-api-key',
        flag: ['--auth-choice', 'moonshot-api-key'],
        secretFlag: '--moonshot-api-key' }
    ]
  },
  {
    provider: 'Kimi Coding',
    category: 'more',
    description: 'AI-powered code assistant',
    emoji: '\u{1F4BB}',
    options: [
      { label: 'API Key', value: 'kimi-code-api-key',
        flag: ['--auth-choice', 'kimi-code-api-key'],
        secretFlag: '--kimi-code-api-key' }
    ]
  },
  {
    provider: 'Z.AI (GLM)',
    category: 'more',
    description: 'Zhipu GLM series models',
    emoji: '\u{1F4A0}',
    options: [
      { label: 'API Key', value: 'zai-api-key',
        flag: ['--auth-choice', 'zai-api-key'],
        secretFlag: '--zai-api-key' }
    ]
  },
  {
    provider: 'Cloudflare AI Gateway',
    category: 'more',
    description: 'Edge AI inference gateway',
    emoji: '\u2601\uFE0F',
    options: [
      { label: 'API Key + IDs', value: 'cloudflare-ai-gateway-api-key',
        flag: ['--auth-choice', 'cloudflare-ai-gateway-api-key'],
        secretFlag: '--cloudflare-ai-gateway-api-key',
        extraFields: [
          { id: 'cf-account-id', label: 'Account ID', flag: '--cloudflare-ai-gateway-account-id', placeholder: 'Cloudflare account ID' },
          { id: 'cf-gateway-id', label: 'Gateway ID', flag: '--cloudflare-ai-gateway-gateway-id', placeholder: 'AI Gateway ID' }
        ]
      }
    ]
  },
  {
    provider: 'OpenCode Zen',
    category: 'more',
    description: 'Claude, GPT and more via Zen',
    emoji: '\u{26A1}',
    options: [
      { label: 'API Key', value: 'opencode-zen-api-key', flag: '--opencode-zen-api-key' }
    ]
  },
  {
    provider: 'Ollama',
    category: 'more',
    description: 'Run models locally',
    emoji: '\u{1F999}',
    options: [
      { label: 'No key needed', value: 'ollama', flag: null }
    ]
  },
  {
    provider: 'Custom Provider',
    category: 'more',
    description: 'Any OpenAI-compatible API',
    emoji: '\u{1F527}',
    options: [
      {
        label: 'API Key + Base URL',
        value: 'custom-api-key',
        flag: ['--auth-choice', 'custom-api-key', '--custom-compatibility', 'openai'],
        secretFlag: '--custom-api-key',
        secretOptional: true,
        extraFields: [
          { id: 'custom-base-url', label: 'Base URL', flag: '--custom-base-url', placeholder: 'https://api.example.com/v1' },
          { id: 'custom-model-id', label: 'Model ID', flag: '--custom-model-id', placeholder: 'openai/gpt-4o', hint: 'For Plano/litellm, use provider/model format (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-5)' },
          { id: 'custom-provider-name', label: 'Provider Name', placeholder: 'e.g. Plano, LocalAI', optional: true, noFlag: true },
          { id: 'custom-context-window', label: 'Context Window', placeholder: '200000', optional: true, noFlag: true, type: 'number' }
        ]
      }
    ]
  }
];

// Enrich each provider group with SVG icon data
for (const group of AUTH_GROUPS) {
  group.icon = getProviderIcon(group.provider);
}

// Flat lookup: auth choice value -> full option object (flag, secretFlag, etc.)
const AUTH_OPTION_MAP = {};
for (const group of AUTH_GROUPS) {
  for (const opt of group.options) {
    AUTH_OPTION_MAP[opt.value] = opt;
  }
}

/**
 * Create an auto-backup of the state directory to a temp file
 * @returns {Promise<string>} Path to the backup tar.gz
 */
async function createAutoBackup() {
  const backupPath = join(tmpdir(), `openclaw-auto-backup-${Date.now()}.tar.gz`);
  return new Promise((resolve, reject) => {
    const output = createWriteStream(backupPath);
    const archive = archiver('tar', { gzip: true });
    output.on('close', () => resolve(backupPath));
    archive.on('error', reject);
    archive.pipe(output);
    if (existsSync(OPENCLAW_STATE_DIR)) {
      archive.directory(OPENCLAW_STATE_DIR, '.openclaw');
    }
    archive.finalize();
  });
}

/**
 * Install a Build with Claude skill by downloading and extracting its zip
 * @param {string} slug - Skill slug
 * @param {string} skillsDir - Target directory for skills
 * @returns {Promise<void>}
 */
async function installBwcSkill(slug, skillsDir) {
  const url = `https://buildwithclaude.com/api/skills/${encodeURIComponent(slug)}/download`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download skill "${slug}": ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const targetDir = join(skillsDir, slug);
  mkdirSync(targetDir, { recursive: true });

  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      mkdirSync(join(skillsDir, relativePath), { recursive: true });
      continue;
    }
    const content = await entry.async('nodebuffer');
    // Strip leading slug directory if the zip wraps files in a folder
    const parts = relativePath.split('/');
    let outPath;
    if (parts[0] === slug && parts.length > 1) {
      outPath = join(targetDir, parts.slice(1).join('/'));
    } else {
      outPath = join(skillsDir, relativePath);
    }
    const dir = join(outPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, content);
  }
}

/**
 * Install a ClawHub skill via npx clawhub install
 * @param {string} slug - Skill slug
 * @param {string} skillsDir - Target directory for skills
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
async function installClawHubSkill(slug, skillsDir) {
  return runExec('npx', ['clawhub', 'install', slug, '--dir', skillsDir]);
}

// Create Express app
const app = express();
// Trust proxy so req.protocol/req.ip are correct behind Railway/ingress.
app.set('trust proxy', 1);

function getRequestOrigin(req) {
  const xfProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
  const xfHost = (req.headers['x-forwarded-host'] || '').toString().split(',')[0].trim();
  const proto = xfProto || req.protocol || 'http';
  const host = xfHost || req.headers.host;
  return `${proto}://${host}`;
}

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser
app.use((req, res, next) => {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
    });
  }
  req.cookies = cookies;
  next();
});

// Health check endpoints - no authentication required
app.use('/health', healthRouter);

// Root: redirect to Mission Control (authenticated) or /auth (unauthenticated).
// requireUser() handles the redirect to /auth automatically when not logged in.
app.get('/', requireUser(), (req, res) => {
  res.redirect('/mission-control');
});

// Mission Control
app.use('/mission-control', missionControlRouter);

// Mission Control event push — bot skill calls this to record arbitrary events in the audit trail.
// Protected by SETUP_PASSWORD Bearer token (same as other bot-facing endpoints).
// The bot does NOT need a Supabase session; it uses the shared SETUP_PASSWORD.
// A x-user-id header (or query param) identifies which user's audit log to write to.
app.post('/api/mc/events', express.json(), async (req, res) => {
  // Auth: SETUP_PASSWORD Bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const SETUP_PASSWORD = process.env.SETUP_PASSWORD || '';
  if (!SETUP_PASSWORD || token !== SETUP_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event_type, actor, payload, user_id } = req.body || {};
  const userId = user_id || req.headers['x-user-id'] || null;

  if (!event_type || !userId) {
    return res.status(400).json({ error: 'event_type and user_id are required' });
  }

  const adminSb = createSupabaseAdminClient();
  if (!adminSb) {
    return res.status(503).json({ error: 'Supabase admin client not available — check SUPABASE_SERVICE_ROLE_KEY' });
  }

  await emitAudit(adminSb, {
    userId,
    eventType: String(event_type).trim(),
    actor: actor ? String(actor).trim() : 'bot',
    payload: payload && typeof payload === 'object' ? payload : {},
  });

  return res.json({ ok: true });
});

// Sparti Context — brands, agents, projects, copilot tools, agent launch, edge fn invocation
app.use('/api/sparti', spartiContextRouter);

// --- Supabase auth + dashboard ---
app.get('/auth', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  const mode = req.query.mode === 'signup' ? 'signup' : 'login';
  // Clear oc_return so it is only used once for the redirect-to-auth case
  res.clearCookie(OC_RETURN_COOKIE, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.send(getAuthPageHTML({ redirect, mode }));
});

app.post('/auth/session', express.json(), async (req, res) => {
  const redirect = (req.body?.redirect || '/dashboard');
  const accessToken = req.body?.access_token || '';
  const refreshToken = req.body?.refresh_token || '';
  const expiresAt = req.body?.expires_at || null;

  try {
    if (!accessToken || !refreshToken) {
      return res.status(400).send(getAuthPageHTML({ redirect, error: 'Missing session tokens' }));
    }

    // Validate the access token before setting cookies.
    const supabase = createSupabaseClient({ accessToken });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return res.status(401).send(getAuthPageHTML({ redirect, error: 'OAuth session validation failed' }));
    }

    setSupabaseAuthCookies(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: typeof expiresAt === 'number' ? expiresAt : undefined,
    });
    return res.redirect(redirect);
  } catch (err) {
    return res.status(500).send(getAuthPageHTML({ redirect, error: err.message || 'Failed to set session' }));
  }
});

app.post('/auth/login', async (req, res) => {
  const redirect = req.body.redirect || req.query.redirect || '/dashboard';
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return res.status(401).send(getAuthPageHTML({ redirect, error: error?.message || 'Login failed' }));
    }
    setSupabaseAuthCookies(res, data.session);
    return res.redirect(redirect);
  } catch (err) {
    return res.status(500).send(getAuthPageHTML({ redirect, error: err.message || 'Login failed' }));
  }
});

app.post('/auth/signup', async (req, res) => {
  const redirect = req.body.redirect || req.query.redirect || '/dashboard';
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return res.status(400).send(getAuthPageHTML({ redirect, mode: 'signup', error: error.message }));
    }
    // If email confirmations are disabled, session may be present immediately.
    if (data?.session) {
      setSupabaseAuthCookies(res, data.session);
      return res.redirect(redirect);
    }
    return res.send(
      getAuthPageHTML({
        redirect,
        error: 'Account created. Please check your email to confirm, then sign in.',
      })
    );
  } catch (err) {
    return res.status(500).send(getAuthPageHTML({ redirect, mode: 'signup', error: err.message || 'Signup failed' }));
  }
});

app.post('/auth/logout', (req, res) => {
  clearSupabaseAuthCookies(res);
  res.redirect('/auth');
});

app.get('/dashboard', requireUser(), async (req, res) => {
  try {
    // Ensure SaaS bootstrap config exists (if env vars provided).
    await ensureOpenClawConfigFromEnv();

    const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
    const { data, error } = await supabase
      .from('instances')
      .select('id,name,status,created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).send(getDashboardPageHTML({ userEmail: req.user?.email, instance: null, channelGroups: CHANNEL_GROUPS, channelsConfig: {}, error: error.message }));
    }

    // SaaS mode: exactly one instance per user. Auto-create on first visit.
    let instances = data || [];
    if (instances.length === 0) {
      const email = (req.user?.email || '').trim();
      const baseName = email ? email.split('@')[0] : 'workspace';
      const name = `Workspace · ${baseName}`.slice(0, 80);
      const created = await supabase
        .from('instances')
        .insert({ user_id: req.user.id, name })
        .select('id,name,status,created_at')
        .single();
      if (created.error) {
        return res.status(500).send(getDashboardPageHTML({ userEmail: req.user?.email, instance: null, channelGroups: CHANNEL_GROUPS, channelsConfig: {}, error: created.error.message }));
      }
      instances = [created.data];
    } else if (instances.length > 1) {
      // Defensive: if historical data exists, keep newest only for the dashboard.
      instances = [instances[0]];
    }

    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    let channelsConfig = {};
    if (existsSync(configFile)) {
      try {
        const raw = JSON.parse(readFileSync(configFile, 'utf-8'));
        channelsConfig = raw?.channels && typeof raw.channels === 'object' ? raw.channels : {};
      } catch {
        channelsConfig = {};
      }
    }

    const savedChannel = (req.query.saved || '').toString().slice(0, 64) || null;
    return res.send(getDashboardPageHTML({
      userEmail: req.user?.email,
      instance: instances[0] || null,
      channelGroups: CHANNEL_GROUPS,
      channelsConfig,
      saved: savedChannel || undefined,
    }));
  } catch (err) {
    return res.status(500).send(getDashboardPageHTML({ userEmail: req.user?.email, instance: null, channelGroups: CHANNEL_GROUPS, channelsConfig: {}, error: err.message || 'Failed to load dashboard' }));
  }
});

app.post('/dashboard/channels/:name', requireUser(), async (req, res) => {
  const channelName = (req.params.name || '').toString();
  const channelDef = CHANNEL_GROUPS.find(c => c.name === channelName);
  if (!channelDef) {
    return res.status(404).send('Unknown channel');
  }

  const enabled = req.body?.enabled === 'true' || req.body?.enabled === 'on';
  const fields = {};
  for (const f of channelDef.fields || []) {
    const v = req.body?.[f.id];
    if (v == null) continue;
    fields[f.id] = String(v);
  }

  try {
    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    if (!existsSync(configFile)) {
      return res.status(400).send(getDashboardPageHTML({
        userEmail: req.user?.email,
        instance: null,
        channelGroups: CHANNEL_GROUPS,
        channelsConfig: {},
        error: 'OpenClaw is not configured yet. Set LLM Gateway env vars and restart to auto-bootstrap.',
      }));
    }

    // Install plugin if required and enabling
    if (enabled) {
      const plugin = getRequiredPlugin(channelName);
      if (plugin) {
        await runCmd('plugins', ['install', plugin]);
      }
    }

    const channelConfig = buildChannelConfig(channelName, fields);
    channelConfig.enabled = enabled;
    const setResult = await runCmd('config', [
      'set', '--json',
      `channels.${channelName}`,
      JSON.stringify(channelConfig),
    ]);
    if (setResult.code !== 0) {
      throw new Error((setResult.stderr || setResult.stdout || 'Failed to update channel').trim());
    }

    // Restart or start the gateway so the new channel config takes effect.
    // If already running, stop then start so OpenClaw reloads the config.
    if (isGatewayRunning()) {
      await stopGateway();
    }
    await startGateway();

    return res.redirect('/dashboard?saved=' + encodeURIComponent(channelName) + '#tab=channels');
  } catch (err) {
    try {
      const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
      const { data } = await supabase
        .from('instances')
        .select('id,name,status,created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
      const instance = (data && data[0]) ? data[0] : null;

      const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
      let channelsConfig = {};
      if (existsSync(configFile)) {
        try {
          const raw = JSON.parse(readFileSync(configFile, 'utf-8'));
          channelsConfig = raw?.channels && typeof raw.channels === 'object' ? raw.channels : {};
        } catch { channelsConfig = {}; }
      }

      return res.status(500).send(getDashboardPageHTML({
        userEmail: req.user?.email,
        instance,
        channelGroups: CHANNEL_GROUPS,
        channelsConfig,
        error: err.message || 'Failed to update channel',
      }));
    } catch {
      return res.status(500).send('Failed to update channel');
    }
  }
});

// Display names and descriptions for well-known toolkits.
const TOOLKIT_META = {
  slack: { name: 'Slack', description: 'Send messages, manage channels, and automate workflows.', recommended: true },
  github: { name: 'GitHub', description: 'Source control, issues, pull requests, and workflows.', recommended: true },
  googlesuper: { name: 'Google Super', description: 'One OAuth for Gmail, Drive, Calendar, Sheets, Docs, Meet, Analytics, Ads, Photos, and more. Use via Composio MCP.', recommended: true },
  google_super: { name: 'Google Super', description: 'One OAuth for Gmail, Drive, Calendar, Sheets, Docs, Meet, Analytics, Ads, Photos, and more. Use via Composio MCP.', recommended: true },
  gmail: { name: 'Gmail', description: 'Read, send, and manage Gmail messages and contacts.', recommended: true },
  googledrive: { name: 'Google Drive', description: 'Access and manage files in Google Drive.', recommended: false },
  googlesheets: { name: 'Google Sheets', description: 'Read and write Google Sheets spreadsheets.', recommended: false },
  googledocs: { name: 'Google Docs', description: 'Create and edit Google Docs documents.', recommended: false },
  googlecalendar: { name: 'Google Calendar', description: 'Manage events and schedules in Google Calendar.', recommended: false },
  googleslides: { name: 'Google Slides', description: 'Create and edit Google Slides presentations.', recommended: false },
  googleads: { name: 'Google Ads', description: 'Manage Google Ads campaigns and reporting. Standalone when not using Google Super.', recommended: false },
  google_analytics: { name: 'Google Analytics', description: 'Access Google Analytics data and reports.', recommended: false },
  google_search_console: { name: 'Google Search Console', description: 'Monitor search performance and indexing.', recommended: false },
  googlemeet: { name: 'Google Meet', description: 'Create and manage Google Meet video meetings.', recommended: false },
  notion: { name: 'Notion', description: 'Read and write Notion pages, databases, and blocks.', recommended: true },
  hubspot: { name: 'HubSpot', description: 'CRM, contacts, deals, and marketing automation.', recommended: true },
  discord: { name: 'Discord', description: 'Send messages and manage Discord servers and channels.', recommended: false },
  linkedin: { name: 'LinkedIn', description: 'Post content and manage LinkedIn profile activity.', recommended: false },
  instagram: { name: 'Instagram', description: 'Manage Instagram business posts, comments, and insights.', recommended: false },
  facebook: { name: 'Facebook', description: 'Manage Facebook Pages, posts, and engagement.', recommended: false },
  canva: { name: 'Canva', description: 'Create and manage Canva designs and assets.', recommended: false },
  clickup: { name: 'ClickUp', description: 'Manage tasks, projects, and workspaces in ClickUp.', recommended: false },
  asana: { name: 'Asana', description: 'Manage tasks and projects in Asana.', recommended: false },
  calendly: { name: 'Calendly', description: 'Manage scheduling and availability in Calendly.', recommended: false },
  eventbrite: { name: 'Eventbrite', description: 'Create and manage events on Eventbrite.', recommended: false },
  mailchimp: { name: 'Mailchimp', description: 'Manage email campaigns and audiences in Mailchimp.', recommended: false },
  supabase: { name: 'Supabase', description: 'Manage Supabase projects, tables, and edge functions.', recommended: false },
  heygen: { name: 'HeyGen', description: 'Generate AI videos with HeyGen.', recommended: false },
  cloudflare: { name: 'Cloudflare', description: 'Manage Cloudflare DNS, Workers, and Pages.', recommended: false },
  apify: { name: 'Apify', description: 'Run web scraping and automation actors on Apify.', recommended: false },
  apollo: { name: 'Apollo', description: 'Prospect, enrich contacts, and manage sequences in Apollo.', recommended: false },
  ahrefs: { name: 'Ahrefs', description: 'SEO data — backlinks, keywords, site audits.', recommended: false },
  zoom: { name: 'Zoom', description: 'Create and manage Zoom meetings and webinars.', recommended: false },
  youtube: { name: 'YouTube', description: 'Manage YouTube videos, playlists, and channel data.', recommended: false },
  whatsapp: { name: 'WhatsApp', description: 'Send and receive WhatsApp Business messages.', recommended: false },
  vercel: { name: 'Vercel', description: 'Deploy and manage Vercel projects and deployments.', recommended: false },
  trello: { name: 'Trello', description: 'Manage Trello boards, lists, and cards.', recommended: false },
  tripadvisor: { name: 'TripAdvisor', description: 'Access TripAdvisor reviews and location data.', recommended: false },
  tripadvisor_content_api: { name: 'TripAdvisor Content API', description: 'Access TripAdvisor content and media via the Content API.', recommended: false },
  semrush: { name: 'SEMrush', description: 'SEO and competitive intelligence — keywords, audits, backlinks.', recommended: false },
  salesforce: { name: 'Salesforce', description: 'CRM — contacts, leads, opportunities, and workflows.', recommended: false },
  pexels: { name: 'Pexels', description: 'Search and download free stock photos and videos.', recommended: false },
  monday: { name: 'Monday.com', description: 'Manage boards, items, and workflows in Monday.com.', recommended: false },
  make: { name: 'Make', description: 'Trigger and manage Make (Integromat) automation scenarios.', recommended: false },
  v0: { name: 'v0', description: 'Generate UI components with Vercel v0.', recommended: false },
};

app.get('/dashboard/connectors', requireUser(), async (req, res) => {
  // Server-side only — no secrets in browser.
  // Key is shared across all users: env var COMPOSIO_API_KEY or app_settings(key='composio').
  const apiKey = await getComposioApiKey();
  let authConfigs = [];
  let configured = false;

  if (apiKey) {
    try {
      // Use auth configs (v3) — these are the toolkits actually set up in this account,
      // not the global catalog of thousands of apps. This eliminates "toolkit not found" errors.
      authConfigs = await listComposioAuthConfigs({ apiKey, limit: 200 });
      configured = true;
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Failed to fetch Composio auth configs' });
    }
  }

  // Load this user's connection state from Supabase (multiple rows per toolkit allowed).
  /** @type {Record<string, Array<{ connected_account_id: string, status: string }>>} */
  let connectionsByKey = {};
  /** @type {Record<string, { label: string, email?: string }>} */
  let accountDetailsByCaId = {};
  try {
    const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
    const { data: rows } = await supabase
      .from('composio_connections')
      .select('toolkit_key,status,connected_account_id')
      .eq('user_id', req.user.id);
    for (const row of rows || []) {
      if (!row.toolkit_key) continue;
      if (!connectionsByKey[row.toolkit_key]) connectionsByKey[row.toolkit_key] = [];
      if (row.connected_account_id && row.status === 'active') {
        connectionsByKey[row.toolkit_key].push({ connected_account_id: row.connected_account_id, status: row.status });
      }
    }
    // Enrich with email/label from Composio when available.
    if (apiKey) {
      try {
        const composioAccounts = await listConnectedAccountsV3(req.user.id, apiKey);
        for (const a of composioAccounts) {
          accountDetailsByCaId[a.id] = { label: a.label, email: a.email || undefined };
        }
      } catch {
        // Non-fatal: show accounts with id only.
      }
    }
  } catch {
    // Non-fatal: proceed without connection state.
  }

  function connectionBadge(key) {
    const list = connectionsByKey[key];
    const hasActive = list && list.some(r => r.status === 'active');
    return { connected: !!hasActive, status: hasActive ? 'active' : 'disconnected' };
  }

  function accountsForToolkit(key) {
    const list = connectionsByKey[key] || [];
    return list.map(({ connected_account_id }) => {
      const details = accountDetailsByCaId[connected_account_id] || {};
      return {
        id: connected_account_id,
        email: details.email || null,
        label: details.label || connected_account_id,
      };
    });
  }

  // Build connector list from auth configs — one entry per toolkit.
  // Deduplicate by toolkit slug (keep first occurrence).
  const seenToolkits = new Set();
  const composioConnectors = [];
  for (const cfg of authConfigs) {
    if (seenToolkits.has(cfg.toolkit)) continue;
    seenToolkits.add(cfg.toolkit);
    const meta = TOOLKIT_META[cfg.toolkit] || {};
    composioConnectors.push({
      key: cfg.toolkit,
      authConfigId: cfg.id,
      name: meta.name || cfg.name || cfg.toolkit,
      description: meta.description || '',
      provider: 'composio',
      authScheme: cfg.authScheme,
      logo: cfg.logo,
      badges: { recommended: meta.recommended || false, ...connectionBadge(cfg.toolkit) },
      accounts: accountsForToolkit(cfg.toolkit),
    });
  }

  // Sort: recommended first, then alphabetically.
  composioConnectors.sort((a, b) => {
    if (a.badges.recommended !== b.badges.recommended) return a.badges.recommended ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Google Super (googlesuper) = one OAuth for all main Google services; show as its own card when in auth configs.
  const GOOGLE_SUPER_KEYS = new Set(['googlesuper', 'google_super']);
  const googleSuperCard = composioConnectors.find(c => GOOGLE_SUPER_KEYS.has(c.key)) || null;

  // Group individual Google product toolkits into one "Google Workspace" card (per-service Connect).
  // Excludes Google Super so it appears as a standalone card; includes Google Ads and others as standalone options in the group.
  const GOOGLE_TOOLKIT_KEYS = new Set([
    'gmail', 'googledrive', 'googlesheets', 'googledocs', 'googlecalendar', 'googleslides',
    'googleads', 'google_analytics', 'google_search_console', 'googlemeet',
  ]);
  const googleConnectors = composioConnectors.filter(c => GOOGLE_TOOLKIT_KEYS.has(c.key));
  const nonGoogleConnectors = composioConnectors.filter(c => !GOOGLE_TOOLKIT_KEYS.has(c.key) && !GOOGLE_SUPER_KEYS.has(c.key));

  const googleWorkspaceCard = googleConnectors.length > 0
    ? (() => {
        const seenIds = new Set();
        const allAccounts = [];
        for (const ch of googleConnectors) {
          for (const acc of ch.accounts || []) {
            if (acc.id && !seenIds.has(acc.id)) {
              seenIds.add(acc.id);
              allAccounts.push(acc);
            }
          }
        }
        return {
          key: 'google_workspace',
          name: 'Google Workspace (per service)',
          description: 'Gmail, Drive, Sheets, Docs, Calendar, Meet, Google Ads, and more. Connect each service individually.',
          provider: 'composio',
          badges: {
            recommended: false,
            connected: googleConnectors.some(c => c.badges && c.badges.connected),
          },
          children: googleConnectors,
          accounts: allAccounts,
        };
      })()
    : null;

  // Web Search first, then Google Super (if present), then Google Workspace group, then the rest.
  const connectors = [
    {
      key: 'web_search',
      name: 'Web Search',
      description: 'Brave Search (built-in). Optionally use Perplexity via server configuration.',
      provider: 'builtin',
      badges: { active: true, connected: true, recommended: false },
      accounts: [],
    },
    ...(googleSuperCard ? [googleSuperCard] : []),
    ...(googleWorkspaceCard ? [googleWorkspaceCard] : []),
    ...nonGoogleConnectors,
  ];

  return res.json({ connectors, configured });
});

// ── Connector OAuth actions ────────────────────────────────────────────────
// All routes are server-side only. The browser never touches COMPOSIO_API_KEY.
// Flow: connect → set composio_cb cookie with userId → Composio issues a Connect Link
//       → browser redirects → user completes OAuth on Composio's hosted page
//       → Composio redirects back to /dashboard/connectors/callback (no auth required)
//       → callback reads composio_cb cookie to identify user → marks row active.
//
// The callback is intentionally NOT behind requireUser() because the browser's
// Supabase session cookie may have expired while the user was on Composio's OAuth
// page. Using requireUser() on the callback causes a redirect loop: Composio →
// /callback → /auth?redirect=/callback → login → /callback (success params intact
// only if the redirect encoding is perfect). The composio_cb cookie is safer:
// it's httpOnly, sameSite=strict, 15-minute TTL, and only carries the userId.

const COMPOSIO_CB_COOKIE = 'composio_cb';

/** Encrypt refresh token for session restore after OAuth (same cookie survives redirect; Supabase cookies may not). */
function encryptRefreshForCallback(refreshToken) {
  if (!refreshToken || typeof refreshToken !== 'string') return null;
  const key = createHash('sha256').update((process.env.SETUP_PASSWORD || 'openclaw-cb').toString()).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString('base64url');
}

/** Decrypt refresh token from composio_cb cookie; returns null on failure. */
function decryptRefreshFromCallback(encrypted) {
  if (!encrypted || typeof encrypted !== 'string') return null;
  try {
    const buf = Buffer.from(encrypted, 'base64url');
    if (buf.length < 32 + 16) return null; // iv(16) + authTag(16) + payload
    const key = createHash('sha256').update((process.env.SETUP_PASSWORD || 'openclaw-cb').toString()).digest();
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const enc = buf.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function setComposioCallbackCookie(res, userId, toolkitKey, returnTo, refreshTokenEncrypted = null) {
  const payload = {
    userId,
    toolkitKey,
    returnTo: returnTo || null,
    ts: Date.now(),
    ...(refreshTokenEncrypted ? { r: refreshTokenEncrypted } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  res.cookie(COMPOSIO_CB_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // must be lax (not strict) so the cookie is sent on the Composio redirect back
    maxAge: 15 * 60 * 1000,
    path: '/dashboard/connectors/callback',
  });
}

function readComposioCallbackCookie(req) {
  try {
    const raw = req.cookies?.[COMPOSIO_CB_COOKIE];
    if (!raw) return null;
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!parsed?.userId || !parsed?.toolkitKey) return null;
    // Reject stale cookies (> 20 minutes old)
    if (Date.now() - (parsed.ts || 0) > 20 * 60 * 1000) return null;
    return {
      userId: String(parsed.userId),
      toolkitKey: String(parsed.toolkitKey),
      returnTo: typeof parsed.returnTo === 'string' ? parsed.returnTo : null,
      refreshTokenEncrypted: typeof parsed.r === 'string' ? parsed.r : null,
    };
  } catch {
    return null;
  }
}

/**
 * Extract the originating page path from the request.
 * The client can send it as `returnTo` in the JSON body, or we fall back to the Referer header.
 * Only same-origin relative paths are accepted to prevent open-redirect.
 */
function resolveReturnTo(req) {
  const fromBody = req.body?.returnTo;
  if (typeof fromBody === 'string' && /^\/[a-zA-Z0-9/_#-]/.test(fromBody)) {
    return fromBody;
  }
  const referer = req.headers.referer || req.headers.referrer || '';
  try {
    const url = new URL(referer);
    const origin = getRequestOrigin(req);
    if (url.origin === origin) {
      return url.pathname + url.hash;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Determine the return URL after a successful or failed Composio OAuth callback.
 * Validates the returnTo URL is same-origin and safe (no open-redirect).
 * @param {string|null} returnTo - Where to redirect (relative path)
 * @param {'success'|'failed'} outcome
 * @param {string} [toolkitKey] - Toolkit slug, used for /connected page display name
 */
function resolveCallbackReturnUrl(returnTo, outcome, toolkitKey) {
  const suffix = outcome === 'success' ? '&connect=success' : '&connect=failed';
  // Only allow same-origin relative paths starting with /
  if (returnTo && /^\/[a-zA-Z0-9/_#?=-]/.test(returnTo)) {
    // /connected is a special standalone page — just pass toolkit as query param on success
    if (returnTo === '/connected' || returnTo.startsWith('/connected?')) {
      if (outcome === 'success') {
        const tk = toolkitKey ? `?toolkit=${encodeURIComponent(toolkitKey)}` : '';
        return `/connected${tk}`;
      }
      return '/dashboard#tab=connectors&connect=failed';
    }
    // Append connect outcome to the hash if the path contains #, else append as hash
    if (returnTo.includes('#')) {
      return returnTo + suffix;
    }
    return returnTo + '#connect=' + outcome;
  }
  return '/dashboard#tab=connectors' + suffix;
}

// ── Callback token (bot-initiated OAuth) ──────────────────────────────────────
// When the bot generates a Connect Link, there's no browser session to set a
// cookie on. Instead we embed a short-lived HMAC-signed token in the callbackUrl
// query string so the callback can verify and identify the user without a cookie.
//
// Token format (base64url): <userId>:<toolkitKey>:<ts>:<hmac>
// HMAC key: SETUP_PASSWORD (already a secret on the server)
// TTL: 20 minutes (same as composio_cb cookie)

const CB_TOKEN_TTL_MS = 20 * 60 * 1000;

function makeCallbackToken(userId, toolkitKey, returnTo) {
  const ts = Date.now();
  const pw = (process.env.SETUP_PASSWORD || '').toString();
  const payload = `${userId}:${toolkitKey}:${ts}`;
  const sig = createHmac('sha256', pw).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({ userId, toolkitKey, ts, sig, returnTo: returnTo || null })).toString('base64url');
  return token;
}

function verifyCallbackToken(token) {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const { userId, toolkitKey, ts, sig, returnTo } = parsed;
    if (!userId || !toolkitKey || !ts || !sig) return null;
    if (Date.now() - ts > CB_TOKEN_TTL_MS) return null;
    const pw = (process.env.SETUP_PASSWORD || '').toString();
    const payload = `${userId}:${toolkitKey}:${ts}`;
    const expected = createHmac('sha256', pw).update(payload).digest('hex');
    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
    return {
      userId: String(userId),
      toolkitKey: String(toolkitKey),
      returnTo: typeof returnTo === 'string' ? returnTo : null,
    };
  } catch {
    return null;
  }
}

app.post('/dashboard/connectors/:key/connect', requireUser(), async (req, res) => {
  const toolkitKey = req.params.key;
  const userId = req.user.id;

  const composioApiKey = await getComposioApiKey();
  if (!composioApiKey) {
    return res.status(503).json({ error: 'Composio is not configured on this server. Set COMPOSIO_API_KEY or add app_settings(key=\'composio\').' });
  }

  // Capture the originating page so the callback can redirect back to it.
  // The client sends it in the request body (preferred) or we fall back to Referer.
  const returnTo = resolveReturnTo(req);

  try {
    const origin = getRequestOrigin(req);
    const { redirectUrl, connectionRequestId } = await generateConnectLink(userId, toolkitKey, origin, composioApiKey);

    // No DB write here — callback will insert/upsert by (user_id, toolkit_key, connected_account_id).
    // Multiple accounts per toolkit are supported.

    // Set a short-lived cookie so the callback can identify the user,
    // know where to redirect (returnTo), and optionally restore the Supabase session
    // so the user is not asked to log in again after returning from Composio OAuth.
    const { refreshToken } = getSupabaseTokensFromRequest(req);
    const refreshEnc = refreshToken ? encryptRefreshForCallback(refreshToken) : null;
    setComposioCallbackCookie(res, userId, toolkitKey, returnTo, refreshEnc);
    // Preserve return path (with hash) so if user lands on /auth, redirect after login goes to the right place.
    if (returnTo) {
      res.cookie(OC_RETURN_COOKIE, returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 20 * 60 * 1000,
        path: '/',
      });
    }

    return res.json({ redirectUrl });
  } catch (err) {
    console.error('[connectors/connect] error:', err.message);
    return res.status(502).json({ error: err.message || 'Failed to generate connect link' });
  }
});

// Callback from Composio after the user completes (or fails) OAuth.
// Composio appends: ?status=success&connected_account_id=ca_xxx&toolkit=...
// No requireUser() here — see comment above. We identify the user via:
//   1. composio_cb cookie (browser-initiated flow)
//   2. cbt query param — HMAC-signed token (bot-initiated flow, no cookie available)
//   3. Live Supabase session (last resort)
app.get('/dashboard/connectors/callback', async (req, res) => {
  const { status, connected_account_id, toolkit, cbt } = req.query;

  // Try cookie first (browser-initiated flow).
  const cbCookie = readComposioCallbackCookie(req);

  // Try HMAC token from query param (bot-initiated flow).
  const cbToken = typeof cbt === 'string' && cbt.trim() ? verifyCallbackToken(cbt.trim()) : null;

  // Prefer toolkit from query param (embedded in callbackUrl); fall back to cookie/token.
  const toolkitKey = (typeof toolkit === 'string' && toolkit.trim())
    ? toolkit.trim()
    : (cbCookie?.toolkitKey || cbToken?.toolkitKey || '');

  // Clear the callback cookie regardless of outcome.
  res.clearCookie(COMPOSIO_CB_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/dashboard/connectors/callback',
  });

  // returnTo: cookie takes priority (browser flow), then token (bot flow).
  const returnTo = cbCookie?.returnTo || cbToken?.returnTo || null;

  if (status !== 'success' || !connected_account_id || !toolkitKey) {
    return res.redirect(resolveCallbackReturnUrl(returnTo, 'failed', toolkitKey));
  }

  // Resolve userId: cookie → token → live session.
  let userId = cbCookie?.userId || cbToken?.userId || null;
  if (!userId) {
    // Try to read from live session as a last resort.
    try {
      const { accessToken } = getSupabaseTokensFromRequest(req);
      if (accessToken) {
        const supabase = createSupabaseClient({ accessToken });
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      }
    } catch { /* ignore */ }
  }

  if (!userId) {
    console.error('[connectors/callback] could not identify user — no cookie and no session');
    return res.redirect(resolveCallbackReturnUrl(returnTo, 'failed', toolkitKey));
  }

  try {
    // Use service-role client since we may not have a user access token here.
    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseAdminClient()
      : createSupabaseClient();
    // Insert or update by (user_id, toolkit_key, connected_account_id) to support multiple accounts per toolkit.
    const { error: dbErr } = await supabase
      .from('composio_connections')
      .upsert(
        {
          user_id: userId,
          toolkit_key: toolkitKey,
          connected_account_id: String(connected_account_id),
          status: 'active',
        },
        { onConflict: 'user_id,toolkit_key,connected_account_id' }
      );
    if (dbErr) {
      console.error('[connectors/callback] db upsert error:', dbErr.message);
    }
  } catch (err) {
    console.error('[connectors/callback] error:', err.message);
  }

  // Restore Supabase session so the user is not asked to log in again after OAuth.
  // The composio_cb cookie survives the redirect from Composio; Supabase cookies may not.
  const refreshEnc = cbCookie?.refreshTokenEncrypted || null;
  if (refreshEnc) {
    const refreshToken = decryptRefreshFromCallback(refreshEnc);
    if (refreshToken) {
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!error && data?.session?.access_token) {
          setSupabaseAuthCookies(res, data.session);
        }
      } catch (e) {
        console.error('[connectors/callback] session restore failed:', e?.message || e);
      }
    }
  }

  return res.redirect(resolveCallbackReturnUrl(returnTo, 'success', toolkitKey));
});

// ── /connected — lightweight post-OAuth landing page ─────────────────────────
// When the bot sends a Connect Link, the returnTo is set to /connected so the
// user sees a clean "you're connected, close this tab" page instead of being
// dumped into the full Mission Control dashboard.
// No auth required — this page carries no sensitive data.
app.get('/connected', (req, res) => {
  const toolkit = typeof req.query.toolkit === 'string' ? req.query.toolkit : '';
  const name = toolkit ? toolkit.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Integration';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${name} Connected</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1d27; border: 1px solid #2d3148; border-radius: 16px; padding: 48px 40px; text-align: center; max-width: 420px; width: 90%; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 10px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    .badge { display: inline-block; background: #0d3d2e; color: #00e5cc; border: 1px solid #00e5cc44; border-radius: 20px; padding: 6px 16px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .btn { display: inline-block; background: #1e40af; color: #fff; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #1d4ed8; }
    .close-note { font-size: 12px; color: #64748b; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>${name} Connected</h1>
    <div class="badge">✓ Authorization successful</div>
    <p>Your ${name} account has been linked. You can now use it through the bot — go back to your chat to continue.</p>
    <a href="/mission-control#integrations" class="btn">Open Mission Control</a>
    <div class="close-note">Or close this tab and return to your conversation.</div>
  </div>
  <script>
    // Auto-close if opened as a popup (e.g. window.open from a mobile app).
    if (window.opener) {
      window.opener.postMessage({ type: 'composio-connected', toolkit: '${toolkit.replace(/'/g, "\\'")}' }, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`);
});

app.post('/dashboard/connectors/:key/reconnect', requireUser(), async (req, res) => {
  // Reconnect is identical to connect: generate a fresh short-lived link.
  const toolkitKey = req.params.key;
  const userId = req.user.id;

  const composioApiKey = await getComposioApiKey();
  if (!composioApiKey) {
    return res.status(503).json({ error: 'Composio is not configured on this server. Set COMPOSIO_API_KEY or add app_settings(key=\'composio\').' });
  }

  try {
    const origin = getRequestOrigin(req);
    const { redirectUrl, connectionRequestId } = await generateConnectLink(userId, toolkitKey, origin, composioApiKey);

    // No DB write — callback will upsert by (user_id, toolkit_key, connected_account_id).

    // Same cookie as connect — callback needs it to identify the user, return them to the right page, and restore session.
    const returnTo = resolveReturnTo(req);
    const { refreshToken } = getSupabaseTokensFromRequest(req);
    const refreshEnc = refreshToken ? encryptRefreshForCallback(refreshToken) : null;
    setComposioCallbackCookie(res, userId, toolkitKey, returnTo, refreshEnc);
    if (returnTo) {
      res.cookie(OC_RETURN_COOKIE, returnTo, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 20 * 60 * 1000,
        path: '/',
      });
    }

    return res.json({ redirectUrl });
  } catch (err) {
    console.error('[connectors/reconnect] error:', err.message);
    return res.status(502).json({ error: err.message || 'Failed to generate reconnect link' });
  }
});

app.post('/dashboard/connectors/:key/disconnect', requireUser(), async (req, res) => {
  const toolkitKey = req.params.key;
  const userId = req.user.id;
  const connectedAccountId = req.body?.connectedAccountId && String(req.body.connectedAccountId).trim();

  try {
    const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });

    let rows;
    if (connectedAccountId) {
      const { data, error: fetchErr } = await supabase
        .from('composio_connections')
        .select('id, connected_account_id')
        .eq('user_id', userId)
        .eq('toolkit_key', toolkitKey)
        .eq('connected_account_id', connectedAccountId)
        .in('status', ['active', 'initiated']);
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      rows = data || [];
    } else {
      const { data, error: fetchErr } = await supabase
        .from('composio_connections')
        .select('id, connected_account_id')
        .eq('user_id', userId)
        .eq('toolkit_key', toolkitKey)
        .eq('status', 'active');
      if (fetchErr) return res.status(500).json({ error: fetchErr.message });
      rows = data || [];
      if (rows.length > 1) {
        return res.status(400).json({ error: 'Multiple accounts connected. Pass connectedAccountId in the request body to disconnect a specific account.' });
      }
    }

    for (const row of rows) {
      if (row?.connected_account_id) {
        try {
          const composioApiKey = await getComposioApiKey();
          await disconnectComposioAccount(row.connected_account_id, composioApiKey);
        } catch (composioErr) {
          console.error('[connectors/disconnect] Composio error:', composioErr.message);
        }
      }
      await supabase
        .from('composio_connections')
        .update({ status: 'disconnected', connected_account_id: null })
        .eq('id', row.id);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[connectors/disconnect] error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to disconnect' });
  }
});

// ── Skills API ────────────────────────────────────────────────────────────────
// GET  /dashboard/api/skills        — list installed skills with enabled status
// POST /dashboard/api/skills/:name/toggle — enable or disable a skill

app.get('/dashboard/api/skills', requireUser(), async (req, res) => {
  const skillsDir = join(OPENCLAW_STATE_DIR, 'skills');
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');

  let enabledMap = {};
  try {
    const cfg = JSON.parse(readFileSync(configFile, 'utf-8'));
    enabledMap = cfg?.skills?.entries || {};
  } catch { /* config may not exist yet */ }

  const skills = [];
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const skillPath = join(skillsDir, name);
      try {
        if (!lstatSync(skillPath).isDirectory()) continue;
        const skillMdPath = join(skillPath, 'SKILL.md');
        if (!existsSync(skillMdPath)) continue;

        let description = '';
        let version = '';
        const md = readFileSync(skillMdPath, 'utf-8');
        const descMatch = md.match(/^description:\s*(.+)$/m);
        const verMatch = md.match(/^version:\s*(.+)$/m);
        if (descMatch) description = descMatch[1].trim();
        if (verMatch) version = verMatch[1].trim();

        const metaPath = join(skillPath, '_meta.json');
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            if (!version && meta.version) version = String(meta.version);
          } catch { /* ignore */ }
        }

        const enabled = enabledMap[name]?.enabled === true;
        skills.push({ name, description, version, enabled });
      } catch { /* skip unreadable entries */ }
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return res.json({ skills });
});

app.post('/dashboard/api/skills/:name/toggle', requireUser(), async (req, res) => {
  const skillName = req.params.name;
  if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
    return res.status(400).json({ error: 'Invalid skill name' });
  }

  const skillsDir = join(OPENCLAW_STATE_DIR, 'skills');
  const skillPath = join(skillsDir, skillName);
  if (!existsSync(join(skillPath, 'SKILL.md'))) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  let config = {};
  try {
    config = JSON.parse(readFileSync(configFile, 'utf-8'));
  } catch { /* start fresh */ }

  config.skills = config.skills || {};
  config.skills.entries = config.skills.entries || {};
  const current = config.skills.entries[skillName]?.enabled === true;
  const next = !current;
  config.skills.entries[skillName] = { enabled: next };

  try {
    writeFileSync(configFile, JSON.stringify(config, null, 2));
    try {
      await gatewayRPC('config.set', { raw: JSON.stringify(config) });
    } catch (rpcErr) {
      console.warn(`[skills/toggle] config.set RPC failed: ${rpcErr.message}`);
    }
    return res.json({ name: skillName, enabled: next });
  } catch (err) {
    console.error('[skills/toggle] error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to toggle skill' });
  }
});

// ── Bot-accessible connect-link endpoint ──────────────────────────────────────
// Called by the composio-connect skill running inside the OpenClaw gateway.
// Protected by SETUP_PASSWORD (Bearer token) — no Supabase user session needed.
//
// The bot passes toolkitKey, userId (real Supabase UUID), and optional returnTo.
// The server embeds a signed callbackToken in the callbackUrl so the OAuth
// callback can identify the user without a browser cookie or live session.
//
// POST /api/composio/connect-link
// Body: { toolkitKey: string, userId?: string, returnTo?: string, origin?: string }
// Response: { redirectUrl: string }
app.post('/api/composio/connect-link', async (req, res) => {
  const pw = (process.env.SETUP_PASSWORD || '').toString();
  if (!pw || !hasValidSetupPassword(req, res, pw)) {
    return res.status(401).json({ error: 'Authentication required. Send SETUP_PASSWORD as Bearer token.' });
  }

  const toolkitKey = typeof req.body?.toolkitKey === 'string' ? req.body.toolkitKey.trim() : '';
  if (!toolkitKey) {
    return res.status(400).json({ error: 'toolkitKey is required' });
  }

  // userId: real Supabase user UUID. Falls back to 'bot-shared' for legacy callers.
  const userId = typeof req.body?.userId === 'string' && req.body.userId.trim()
    ? req.body.userId.trim()
    : 'bot-shared';

  // returnTo: where to redirect after OAuth. Defaults to Mission Control integrations panel.
  const returnTo = typeof req.body?.returnTo === 'string' && /^\/[a-zA-Z0-9/_#-]/.test(req.body.returnTo)
    ? req.body.returnTo
    : '/mission-control#integrations';

  const composioApiKey = await getComposioApiKey();
  if (!composioApiKey) {
    return res.status(503).json({ error: 'Composio is not configured on this server. Set COMPOSIO_API_KEY.' });
  }

  try {
    const origin = typeof req.body?.origin === 'string' && req.body.origin.trim()
      ? req.body.origin.trim()
      : getRequestOrigin(req);

    // Embed a signed token in the callbackUrl so the callback can identify the user
    // without a browser cookie (the bot has no browser session to set cookies on).
    const cbToken = makeCallbackToken(userId, toolkitKey, returnTo);
    const callbackUrl = `${origin}/dashboard/connectors/callback?toolkit=${encodeURIComponent(toolkitKey)}&cbt=${encodeURIComponent(cbToken)}`;
    const { redirectUrl, connectionRequestId } = await initiateComposioConnection(userId, toolkitKey, callbackUrl, composioApiKey);

    // Save initiated state so the connector list shows "pending" while the user completes OAuth.
    if (userId !== 'bot-shared') {
      try {
        const adminSb = process.env.SUPABASE_SERVICE_ROLE_KEY
          ? createSupabaseAdminClient()
          : createSupabaseClient();
        await adminSb.from('composio_connections').upsert(
          { user_id: userId, toolkit_key: toolkitKey, connection_request_id: connectionRequestId, connected_account_id: null, status: 'initiated' },
          { onConflict: 'user_id,toolkit_key' }
        );
      } catch (dbErr) {
        console.error('[api/composio/connect-link] db upsert error:', dbErr.message);
        // Non-fatal — still return the link.
      }
    }

    return res.json({ redirectUrl });
  } catch (err) {
    console.error('[api/composio/connect-link] error:', err.message);
    return res.status(502).json({ error: err.message || 'Failed to generate connect link' });
  }
});

// ── Bot-accessible API-key connect endpoint ───────────────────────────────────
// For services that use API_KEY, BEARER_TOKEN, or BASIC auth (no OAuth redirect).
// Called by the composio-connect skill when the user provides a key directly.
// Connection is immediately active — no redirect needed.
//
// POST /api/composio/connect-api-key
// Body: { toolkitKey: string, credentials: { api_key?: string, token?: string, username?: string, password?: string }, authScheme?: 'API_KEY'|'BEARER_TOKEN'|'BASIC' }
// Response: { connectedAccountId: string, ok: true }
app.post('/api/composio/connect-api-key', async (req, res) => {
  const pw = (process.env.SETUP_PASSWORD || '').toString();
  if (!pw || !hasValidSetupPassword(req, res, pw)) {
    return res.status(401).json({ error: 'Authentication required. Send SETUP_PASSWORD as Bearer token.' });
  }

  const toolkitKey = typeof req.body?.toolkitKey === 'string' ? req.body.toolkitKey.trim() : '';
  if (!toolkitKey) {
    return res.status(400).json({ error: 'toolkitKey is required' });
  }

  const credentials = req.body?.credentials;
  if (!credentials || typeof credentials !== 'object') {
    return res.status(400).json({ error: 'credentials object is required (e.g. { api_key: "..." })' });
  }

  const authScheme = typeof req.body?.authScheme === 'string' ? req.body.authScheme.toUpperCase() : 'API_KEY';
  const validSchemes = ['API_KEY', 'BEARER_TOKEN', 'BASIC'];
  if (!validSchemes.includes(authScheme)) {
    return res.status(400).json({ error: `authScheme must be one of: ${validSchemes.join(', ')}` });
  }

  const composioApiKey = await getComposioApiKey();
  if (!composioApiKey) {
    return res.status(503).json({ error: 'Composio is not configured on this server. Set COMPOSIO_API_KEY.' });
  }

  try {
    const botUserId = 'bot-shared';
    const { connectedAccountId } = await connectWithApiKey(botUserId, toolkitKey, credentials, authScheme, composioApiKey);
    return res.json({ ok: true, connectedAccountId });
  } catch (err) {
    console.error('[api/composio/connect-api-key] error:', err.message);
    return res.status(502).json({ error: err.message || 'Failed to connect with API key' });
  }
});

app.get('/api/instances', requireUser(), async (req, res) => {
  try {
    const supabase = createSupabaseClient({ accessToken: req.supabaseAccessToken });
    const { data, error } = await supabase
      .from('instances')
      .select('id,name,status,created_at,updated_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const instances = data || [];
    return res.json({ instance: instances[0] || null });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list instances' });
  }
});

app.post('/api/instances', requireUser(), async (req, res) => {
  return res.status(405).json({ error: 'Instance creation is disabled (one instance per user).' });
});


// Legacy alias: /login previously handled setup-password auth.
// We now use Supabase auth at /auth.
app.all('/login', (req, res) => {
  const redirectTo = encodeURIComponent(req.query.redirect || '/onboard');
  return res.redirect(`/auth?redirect=${redirectTo}`);
});

function hasValidSetupPassword(req, res, password) {
  if (!password) return false;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [type, token] = authHeader.split(' ');
    if (type === 'Bearer' && token === password) return true;
  }
  if (req.query.password === password) {
    // Mirror legacy behavior: set cookie for subsequent requests
    res.cookie('openclaw_auth', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return true;
  }
  if (req.cookies && req.cookies.openclaw_auth === password) return true;
  return false;
}

// Wrapper pages are protected by Supabase auth (/auth) OR optional legacy setup password.
const wrapperAuth = (req, res, next) => {
  const pw = (process.env.SETUP_PASSWORD || '').toString();
  if (pw && hasValidSetupPassword(req, res, pw)) return next();
  return requireUser()(req, res, next);
};

// Setup wizard routes - main page with web terminal and status
// Handle both GET and POST (POST comes from login form)
const setupHandler = (req, res) => {
  return res.redirect('/dashboard');
};

app.get('/onboard', wrapperAuth, setupHandler);
app.post('/onboard', wrapperAuth, setupHandler);

// Start gateway
app.post('/onboard/start', wrapperAuth, async (req, res) => {
  try {
    await startGateway();
    res.redirect('/onboard');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop gateway
app.post('/onboard/stop', wrapperAuth, async (req, res) => {
  try {
    await stopGateway();
    res.redirect('/onboard');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export backup
app.get('/onboard/export', wrapperAuth, (req, res) => {
  const archive = archiver('tar', { gzip: true });

  res.attachment('openclaw-backup.tar.gz');
  archive.pipe(res);

  // Add state directory to archive
  if (existsSync(OPENCLAW_STATE_DIR)) {
    archive.directory(OPENCLAW_STATE_DIR, '.openclaw');
  }

  archive.finalize();
});

// Get config
app.get('/onboard/config', wrapperAuth, (req, res) => {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(readFileSync(configFile, 'utf-8'));
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to parse config file' });
    }
  } else {
    res.json(null);
  }
});

// Save config
app.post('/onboard/config', wrapperAuth, (req, res) => {
  try {
    const config = req.body;

    // Auto-migrate legacy keys before validation
    const { migrated } = migrateConfig(config);

    // Validate against schema
    const result = validate(config);
    if (!result.valid) {
      return res.status(400).json({ error: 'Validation failed', errors: result.errors });
    }

    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true, migrated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Simple Mode API endpoints ---

// Status endpoint
app.get('/onboard/api/status', wrapperAuth, (req, res) => {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  res.json({
    configured: existsSync(configFile),
    gatewayRunning: isGatewayRunning(),
    authGroups: AUTH_GROUPS
  });
});

// Proxy Build with Claude skills list (avoids browser CORS issues)
app.get('/onboard/api/bwc-skills', wrapperAuth, async (req, res) => {
  try {
    const response = await fetch('https://buildwithclaude.com/api/plugins/list?type=skill&limit=100');
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Upstream API error' });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch skills from buildwithclaude.com' });
  }
});

// Run setup (simple mode)
app.post('/onboard/api/run', wrapperAuth, async (req, res) => {
  try {
    const { authChoice, authSecret, extraFieldValues, flow, channels: channelPayload, skills } = req.body;
    const logs = [];

    // Build onboard command args
    const onboardArgs = ['--non-interactive', '--accept-risk', '--json'];

    if (flow) {
      onboardArgs.push('--flow', flow);
    }

    const opt = AUTH_OPTION_MAP[authChoice];
    const flag = opt?.flag;
    if (flag) {
      if (Array.isArray(flag)) {
        onboardArgs.push(...flag);
        // For secretOptional providers (e.g. Plano), fall back to 'nokey' so the
        // flag is always passed and onboard doesn't prompt interactively.
        const secretVal = authSecret || (opt.secretOptional ? 'nokey' : null);
        if (opt.secretFlag && secretVal) {
          onboardArgs.push(opt.secretFlag, secretVal);
        }
      } else if (authSecret) {
        onboardArgs.push(flag, authSecret);
      }
    }

    // Handle extra fields (e.g., Cloudflare account/gateway IDs)
    if (opt?.extraFields && extraFieldValues) {
      for (const field of opt.extraFields) {
        if (field.noFlag) continue;
        const val = extraFieldValues[field.id];
        if (val && field.flag) {
          onboardArgs.push(field.flag, val);
        }
      }
    }

    // Run onboard
    logs.push('> openclaw onboard ' + onboardArgs.map(a => a.startsWith('--') ? a : '***').join(' '));
    const onboardResult = await runCmd('onboard', onboardArgs);
    if (onboardResult.stdout) logs.push(onboardResult.stdout.trim());
    if (onboardResult.stderr) logs.push(onboardResult.stderr.trim());

    if (onboardResult.code !== 0) {
      // onboard always tries to verify the gateway connection after writing config.
      // Since no gateway is running yet (we start it below), the verification fails
      // and onboard exits non-zero. Check if config was actually written — if so,
      // treat the gateway verification failure as non-fatal and continue.
      const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
      if (!existsSync(configFile)) {
        return res.json({ success: false, logs });
      }
      logs.push('(Gateway verification skipped — gateway will be started next)');
    }

    // Patch custom provider fields that the CLI doesn't handle (provider name, context window)
    // OpenClaw stores providers at config.models.providers.<key> with models as array of objects
    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    if (existsSync(configFile) && extraFieldValues) {
      try {
        const config = JSON.parse(readFileSync(configFile, 'utf8'));
        const cfgProviders = config.models?.providers;
        if (cfgProviders && typeof cfgProviders === 'object') {
          for (const [key, providerEntry] of Object.entries(cfgProviders)) {
            if (!providerEntry || !Array.isArray(providerEntry.models)) continue;
            // Set contextWindow on individual model entries
            const ctxVal = extraFieldValues['custom-context-window'];
            if (ctxVal) {
              const ctxNum = parseInt(ctxVal, 10);
              for (const model of providerEntry.models) {
                if (model && typeof model === 'object' && model.id) {
                  model.contextWindow = ctxNum;
                  logs.push(`Set contextWindow=${ctxNum} for model "${model.id}" in provider "${key}"`);
                }
              }
            }
            // Rename provider key if custom name provided
            const newName = extraFieldValues['custom-provider-name']?.trim();
            if (newName && newName !== key) {
              cfgProviders[newName] = providerEntry;
              delete cfgProviders[key];
              logs.push(`Renamed provider "${key}" → "${newName}"`);
              // Also update agents.defaults.model.primary if it references the old provider key
              const primary = config.agents?.defaults?.model?.primary;
              if (primary && primary.startsWith(key + '/')) {
                config.agents.defaults.model.primary = newName + '/' + primary.slice(key.length + 1);
                logs.push(`Updated primary model ref: ${primary} → ${config.agents.defaults.model.primary}`);
              }
            }
          }
          writeFileSync(configFile, JSON.stringify(config, null, 2));
        }
      } catch (e) {
        logs.push(`Warning: failed to patch custom provider config: ${e.message}`);
      }
    }

    // Install skill files to disk (downloads are independent of gateway state)
    if (skills && Array.isArray(skills)) {
      const skillsDir = join(OPENCLAW_STATE_DIR, 'skills');
      mkdirSync(skillsDir, { recursive: true });

      for (const item of skills) {
        const slug = typeof item === 'string' ? item : item.slug;
        const source = typeof item === 'string' ? 'clawhub' : (item.source || 'clawhub');

        try {
          if (source === 'buildwithclaude') {
            logs.push(`Installing skill: ${slug} from buildwithclaude...`);
            await installBwcSkill(slug, skillsDir);
            logs.push(`Installed skill: ${slug}`);
          } else {
            logs.push(`Installing skill: ${slug} from clawhub...`);
            const result = await installClawHubSkill(slug, skillsDir);
            if (result.code !== 0) {
              logs.push(`Warning: clawhub install ${slug} exited with code ${result.code}`);
              if (result.stderr) logs.push(result.stderr.trim());
            } else {
              logs.push(`Installed skill: ${slug}`);
            }
          }
        } catch (err) {
          logs.push(`Warning: Failed to install skill ${slug}: ${err.message}`);
        }

        // Verify SKILL.md exists after install
        const skillDir = join(skillsDir, slug);
        if (!existsSync(join(skillDir, 'SKILL.md'))) {
          logs.push(`Warning: ${slug} installed but SKILL.md not found — skill may not be discoverable`);
        }
      }
    }

    // Install required channel plugins (must happen before gateway start)
    for (const ch of channelPayload || []) {
      const plugin = getRequiredPlugin(ch.name);
      if (plugin) {
        logs.push(`Installing channel plugin: ${plugin}...`);
        const result = await runCmd('plugins', ['install', plugin]);
        if (result.code === 0) {
          logs.push(`Installed plugin: ${plugin}`);
        } else {
          logs.push(`Warning: plugin install ${plugin} failed: ${(result.stderr || '').trim()}`);
        }
      }
    }

    // Start gateway first — it rewrites openclaw.json on startup (v2026.2.22+),
    // so we configure channels/skills AFTER the gateway has initialized.
    logs.push('> Starting gateway...');
    await startGateway();
    logs.push('Gateway started.');

    // Configure channels and skills via the CLI's `config set` command.
    // This goes through the gateway's proper validation pipeline and avoids
    // the file-level race condition where the gateway rewrites openclaw.json
    // on startup (v2026.2.22+), overwriting our raw JSON writes.
    const hasChannels = channelPayload && channelPayload.length > 0;
    const hasSkills = skills && Array.isArray(skills) && skills.length > 0;

    if (hasChannels || hasSkills) {
      // Wait for the gateway's RPC to stabilize before pushing config.
      // startGateway() only checks HTTP liveness; the WebSocket/CLI may
      // need a moment longer to accept config changes.
      const maxWaitAttempts = 6;
      const waitInterval = 1000;
      let rpcReady = false;
      for (let i = 0; i < maxWaitAttempts && !rpcReady; i++) {
        try {
          await gatewayRPC('config.get', {});
          rpcReady = true;
        } catch {
          await new Promise(r => setTimeout(r, waitInterval));
        }
      }
      if (!rpcReady) {
        logs.push('Warning: gateway RPC not ready, proceeding with CLI config set anyway');
      }

      // Configure each channel via `openclaw config set --json channels.<name> <value>`
      for (const ch of channelPayload || []) {
        const channelConfig = buildChannelConfig(ch.name, ch.fields);
        const result = await runCmd('config', [
          'set', '--json',
          `channels.${ch.name}`,
          JSON.stringify(channelConfig)
        ]);
        if (result.code === 0) {
          logs.push(`Configured channel: ${ch.name}`);
        } else {
          logs.push(`Warning: failed to configure channel ${ch.name}: ${(result.stderr || '').trim()}`);
        }
      }

      // Configure each skill via `openclaw config set --json skills.entries.<slug> {"enabled":true}`
      if (hasSkills) {
        for (const item of skills) {
          const slug = typeof item === 'string' ? item : item.slug;
          const result = await runCmd('config', [
            'set', '--json',
            `skills.entries.${slug}`,
            JSON.stringify({ enabled: true })
          ]);
          if (result.code === 0) {
            logs.push(`Enabled skill: ${slug}`);
          } else {
            logs.push(`Warning: failed to enable skill ${slug}: ${(result.stderr || '').trim()}`);
          }
        }
      }

      // Config changes trigger gateway self-restart via SIGUSR1.
      // Wait for the daemon to come back up so the wrapper can re-adopt it,
      // otherwise isGatewayRunning() returns false and the proxy returns 503.
      // Skip this if there's no real gateway (e.g. test/mock environment).
      // The mock gateway returns { mock: true } in its HTTP responses.
      const gwPort = process.env.INTERNAL_GATEWAY_PORT || '18789';
      let hasRealGateway = false;
      try {
        const gwRes = await fetch(`http://127.0.0.1:${gwPort}/health`);
        const gwData = await gwRes.json();
        hasRealGateway = !gwData.mock;
      } catch { /* no gateway on this port */ }

      if (hasRealGateway) {
        // Give the gateway time to detect the config change and restart
        await new Promise(r => setTimeout(r, 5000));
        let stabilized = false;
        for (let i = 0; i < 8; i++) {
          try {
            await fetch(`http://127.0.0.1:${gwPort}/health`);
            stabilized = true;
            break;
          } catch { /* still restarting */ }
          await new Promise(r => setTimeout(r, 2000));
        }
        if (stabilized) {
          // Re-adopt the restarted daemon so isGatewayRunning() stays true
          await startGateway();
          logs.push('Gateway stabilized after config change.');
        } else {
          logs.push('Warning: gateway did not stabilize after config change');
        }
      }
    }

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, logs: [error.message] });
  }
});

// Reset configuration
app.post('/onboard/api/reset', wrapperAuth, async (req, res) => {
  try {
    if (isGatewayRunning()) {
      await stopGateway();
    }
    deleteConfig();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Diagnostic endpoint: run CLI commands for troubleshooting
app.get('/onboard/api/diag', wrapperAuth, async (req, res) => {
  try {
    const results = {};
    const commands = [
      { name: 'status', cmd: 'status', args: ['--deep'] },
      { name: 'channels-status', cmd: 'channels', args: ['status', '--probe'] },
    ];
    for (const { name, cmd, args } of commands) {
      const result = await runCmd(cmd, args);
      results[name] = { stdout: result.stdout, stderr: result.stderr, code: result.code };
    }

    // Also include raw config channels for inspection
    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    try {
      const rawConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
      results.config = {
        channels: rawConfig.channels || {},
        gatewayPort: rawConfig.config?.gateway?.port,
      };
    } catch { results.config = { error: 'Could not read config file' }; }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Lite Management Panel (/lite) routes ---

// Main UI page
const uiHandler = (req, res) => {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  const isConfigured = existsSync(configFile);

  // Redirect to /onboard if not configured
  if (!isConfigured) {
    const pw = req.query.password || req.body?.password || req.cookies?.openclaw_auth || '';
    return res.redirect(`/onboard?password=${encodeURIComponent(pw)}`);
  }

  const gatewayInfo = getGatewayInfo();
  const pw = req.query.password || req.body?.password || req.cookies?.openclaw_auth || '';

  res.send(getUIPageHTML({
    isConfigured,
    gatewayInfo,
    password: pw,
    stateDir: OPENCLAW_STATE_DIR,
    gatewayToken: getGatewayToken(),
    uptime: getGatewayUptime(),
    channelGroups: CHANNEL_GROUPS,
    authGroups: AUTH_GROUPS
  }));
};

app.get('/lite', wrapperAuth, uiHandler);
app.post('/lite', wrapperAuth, uiHandler);

// Lite API: Status
app.get('/lite/api/status', wrapperAuth, (req, res) => {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  const isConfigured = existsSync(configFile);
  const gatewayInfo = getGatewayInfo();

  let model = null;
  let channels = null;
  let auth = null;
  if (isConfigured) {
    try {
      const config = JSON.parse(readFileSync(configFile, 'utf-8'));
      // Support both new and legacy config shapes
      model = config.agents?.defaults?.model?.primary || config.agents?.defaults?.model || config.agent?.model || null;
      channels = config.channels || null;
      auth = config.auth || null;
    } catch {
      // ignore parse errors
    }
  }

  res.json({
    configured: isConfigured,
    gatewayRunning: isGatewayRunning(),
    gatewayInfo,
    uptime: getGatewayUptime(),
    model,
    channels,
    auth,
    timestamp: new Date().toISOString()
  });
});

// Lite API: Logs
app.get('/lite/api/logs', wrapperAuth, (req, res) => {
  const sinceId = parseInt(req.query.since, 10) || 0;
  res.json(getRecentLogs(sinceId));
});

// Lite API: Gateway start
app.post('/lite/api/gateway/start', wrapperAuth, async (req, res) => {
  try {
    await startGateway();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
  // Emit to Mission Control audit trail — best-effort, non-blocking, after response sent.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSb = createSupabaseAdminClient();
      const userId = req.user?.id || req.headers['x-user-id'] || null;
      if (userId) emitAudit(adminSb, { userId, eventType: 'gateway.started', actor: req.user?.email || 'operator', payload: {} });
    } catch { /* non-fatal */ }
  }
});

// Lite API: Gateway stop
app.post('/lite/api/gateway/stop', wrapperAuth, async (req, res) => {
  try {
    await stopGateway();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSb = createSupabaseAdminClient();
      const userId = req.user?.id || req.headers['x-user-id'] || null;
      if (userId) emitAudit(adminSb, { userId, eventType: 'gateway.stopped', actor: req.user?.email || 'operator', payload: {} });
    } catch { /* non-fatal */ }
  }
});

// Lite API: Gateway restart
app.post('/lite/api/gateway/restart', wrapperAuth, async (req, res) => {
  try {
    if (isGatewayRunning()) {
      await stopGateway();
    }
    await startGateway();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const adminSb = createSupabaseAdminClient();
      const userId = req.user?.id || req.headers['x-user-id'] || null;
      if (userId) emitAudit(adminSb, { userId, eventType: 'gateway.restarted', actor: req.user?.email || 'operator', payload: {} });
    } catch { /* non-fatal */ }
  }
});

// Lite API: Pairing approval
app.post('/lite/api/pairing/approve', wrapperAuth, async (req, res) => {
  try {
    const { channel, code } = req.body;
    if (!channel || !code) {
      return res.status(400).json({ success: false, error: 'channel and code are required' });
    }
    const result = await runCmd('pairing', ['approve', channel, code]);
    if (result.code === 0) {
      let message = result.stdout.trim();
      // Try to parse JSON response
      try {
        const parsed = JSON.parse(message);
        return res.json({ success: true, message: parsed.message || message });
      } catch {
        return res.json({ success: true, message });
      }
    } else {
      res.json({ success: false, error: result.stderr.trim() || result.stdout.trim() || 'Pairing approval failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lite API: Get config
app.get('/lite/api/config', wrapperAuth, (req, res) => {
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(readFileSync(configFile, 'utf-8'));
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to parse config file' });
    }
  } else {
    res.json(null);
  }
});

// Lite API: Save config
app.post('/lite/api/config', wrapperAuth, (req, res) => {
  try {
    const config = req.body;

    // Auto-migrate legacy keys before validation
    const { migrated } = migrateConfig(config);

    // Validate against schema
    const result = validate(config);
    if (!result.valid) {
      return res.status(400).json({ success: false, error: 'Validation failed', errors: result.errors });
    }

    const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
    writeFileSync(configFile, JSON.stringify(config, null, 2));
    res.json({ success: true, migrated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lite API: Quick stats (skills count + sessions count)
app.get('/lite/api/stats', wrapperAuth, async (req, res) => {
  let skillsCount = null;
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  if (existsSync(configFile)) {
    try {
      const config = JSON.parse(readFileSync(configFile, 'utf-8'));
      const entries = config.skills?.entries;
      skillsCount = entries ? Object.keys(entries).length : 0;
    } catch { /* ignore parse errors */ }
  }

  let sessionsCount = null;
  try {
    const result = await gatewayRPC('sessions.list', { includeGlobal: true, limit: 100 });
    if (Array.isArray(result)) {
      sessionsCount = result.length;
    } else if (result?.count != null) {
      sessionsCount = result.count;
    } else if (Array.isArray(result?.sessions)) {
      sessionsCount = result.sessions.length;
    }
  } catch (err) {
    // sessions.list RPC failed, will try CLI fallback
  }

  if (sessionsCount == null) {
    try {
      const cliResult = await runCmd('sessions', ['--json']);
      if (cliResult.code === 0) {
        const parsed = JSON.parse(cliResult.stdout);
        if (Array.isArray(parsed)) {
          sessionsCount = parsed.length;
        } else if (parsed?.count != null) {
          sessionsCount = parsed.count;
        } else if (Array.isArray(parsed?.sessions)) {
          sessionsCount = parsed.sessions.length;
        }
      }
    } catch { /* CLI not available */ }
  }

  res.json({ skills: skillsCount, sessions: sessionsCount });
});

// Lite API: Daily token usage (via gateway WebSocket RPC)
app.get('/lite/api/usage', wrapperAuth, async (req, res) => {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let rawDays = null;
  let totals = null;

  // Try gateway RPC first
  try {
    const result = await gatewayRPC('usage.cost', { startDate, endDate });
    if (Array.isArray(result)) {
      rawDays = result;
    } else if (Array.isArray(result?.daily)) {
      rawDays = result.daily;
      totals = result.totals || null;
    } else if (Array.isArray(result?.days)) {
      rawDays = result.days;
      totals = result.totals || null;
    }
  } catch (err) {
    // usage.cost RPC failed, will try CLI fallback
  }

  // CLI fallback: `openclaw usage --json`
  if (!rawDays) {
    try {
      const cliResult = await runCmd('usage', ['--json']);
      if (cliResult.code === 0) {
        const parsed = JSON.parse(cliResult.stdout);
        if (Array.isArray(parsed)) {
          rawDays = parsed;
        } else if (Array.isArray(parsed?.daily)) {
          rawDays = parsed.daily;
          totals = parsed.totals || null;
        } else if (Array.isArray(parsed?.days)) {
          rawDays = parsed.days;
          totals = parsed.totals || null;
        }
      }
    } catch { /* CLI not available */ }
  }

  if (!rawDays || rawDays.length === 0) {
    return res.json({ available: false, days: [] });
  }

  const days = rawDays.map(d => ({
    date: d.date,
    output: d.output || 0,
    input: d.input || 0,
    cacheWrite: d.cacheWrite || 0,
    cacheRead: d.cacheRead || 0,
    total: d.totalTokens || d.total || 0,
    cost: d.totalCost || d.cost || 0
  }));
  return res.json({ available: true, days, totals });
});

// Lite API: Memory status
app.get('/lite/api/memory', wrapperAuth, async (req, res) => {
  try {
    const result = await runCmd('memory', ['status', '--json']);
    if (result.code !== 0) {
      return res.json({ available: false });
    }
    try {
      const parsed = JSON.parse(result.stdout);
      // openclaw memory status --json returns an array of agent objects
      const agent = Array.isArray(parsed) ? parsed[0] : parsed;
      const st = agent?.status || agent || {};
      // List actual memory files for debugging across all possible locations
      let memoryFiles = {};
      const scanDirs = {
        '/data/workspace': 'volume-workspace',
        '/data/workspace/memory': 'volume-workspace-memory',
        '/data/.openclaw/workspace': 'volume-state-workspace',
        '/data/.openclaw/workspace/memory': 'volume-state-workspace-memory',
        '/home/openclaw/.openclaw/workspace': 'home-workspace',
        '/home/openclaw/.openclaw/workspace/memory': 'home-workspace-memory',
      };
      for (const [dir, label] of Object.entries(scanDirs)) {
        try {
          const stat = lstatSync(dir);
          const isLink = stat.isSymbolicLink();
          const files = readdirSync(dir).filter(f =>
            f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.txt')
          );
          if (files.length > 0 || isLink) {
            memoryFiles[label] = { files, isSymlink: isLink };
          }
        } catch {}
      }

      // Count workspace .md files as "indexed" for the UI since our fallback searches them
      let workspaceFileCount = 0;
      try {
        workspaceFileCount = readdirSync('/data/workspace').filter(f =>
          f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.txt')
        ).length;
      } catch {}
      const ftsEntries = st.files ?? st.chunks ?? 0;

      return res.json({
        available: true,
        status: st.fts?.available ? 'active' : 'inactive',
        entries: ftsEntries > 0 ? ftsEntries : workspaceFileCount,
        totalFiles: Math.max(agent?.scan?.totalFiles ?? 0, workspaceFileCount),
        backend: st.backend || null,
        provider: st.provider || null,
        searchMode: st.custom?.searchMode || null,
        memoryFiles
      });
    } catch {
      return res.json({ available: true, status: result.stdout.trim() });
    }
  } catch {
    res.json({ available: false });
  }
});

// Lite API: Memory search
app.get('/lite/api/memory/search', wrapperAuth, async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  try {
    const result = await runCmd('memory', ['search', q, '--json']);
    if (result.code !== 0) {
      return res.json({ available: false, results: [] });
    }
    let results = [];
    try {
      const parsed = JSON.parse(result.stdout);
      results = Array.isArray(parsed) ? parsed : (parsed.results || []);
    } catch {
      if (result.stdout.trim()) {
        results = [{ text: result.stdout.trim() }];
      }
    }

    // If CLI search returns empty, try reading memory files directly as fallback
    // Check all possible locations where OpenClaw may store memory files
    if (results.length === 0) {
      const searchDirs = [
        '/data/workspace',
        '/data/workspace/memory',
        '/data/.openclaw/workspace',
        '/data/.openclaw/workspace/memory',
        '/home/openclaw/.openclaw/workspace',
        '/home/openclaw/.openclaw/workspace/memory',
      ];
      const seen = new Set();
      for (const memDir of searchDirs) {
        try {
          const files = readdirSync(memDir).filter(f =>
            f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.txt')
          );
          for (const file of files) {
            const filePath = join(memDir, file);
            if (seen.has(file)) continue; // avoid duplicates from symlinked dirs
            seen.add(file);
            const content = readFileSync(filePath, 'utf-8');
            if (content.toLowerCase().includes(q.toLowerCase())) {
              results.push({ text: content.trim(), source: `${memDir}/${file}` });
            }
          }
        } catch { /* dir doesn't exist or no readable files */ }
      }
    }

    return res.json({ results });
  } catch {
    res.json({ available: false, results: [] });
  }
});

// Lite API: Memory re-index
app.post('/lite/api/memory/index', wrapperAuth, async (req, res) => {
  try {
    const result = await runCmd('memory', ['index']);
    const output = result.stdout.trim() || result.stderr.trim() || '';
    res.json({ success: result.code === 0, output });
  } catch (err) {
    res.json({ success: false, output: 'Failed to run memory index' });
  }
});

// Lite API: Scheduled tasks (cron)
app.get('/lite/api/cron', wrapperAuth, async (req, res) => {
  try {
    const result = await runCmd('cron', ['list', '--json']);
    if (result.code !== 0) {
      return res.json({ available: false, jobs: [] });
    }
    try {
      const parsed = JSON.parse(result.stdout);
      return res.json({ available: true, jobs: Array.isArray(parsed) ? parsed : (parsed.jobs || []) });
    } catch {
      return res.json({ available: true, jobs: [] });
    }
  } catch {
    res.json({ available: false, jobs: [] });
  }
});

// Lite API: Security audit (config checks and optional live probing)
app.post('/lite/api/security-audit', wrapperAuth, express.json(), async (req, res) => {
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve({ stdout: '', stderr: 'timeout', code: 1 }), ms))
    ]);
  }

  const deep = req.body && req.body.deep === true;
  const timeout = deep ? 30000 : 10000;
  const args = deep ? ['audit', '--deep', '--json'] : ['audit', '--json'];

  try {
    // Try JSON mode first
    const jsonResult = await withTimeout(runCmd('security', args), timeout);
    if (jsonResult.code === 0 && jsonResult.stdout.trim()) {
      try {
        const parsed = JSON.parse(jsonResult.stdout);
        return res.json({ available: true, format: 'json', findings: Array.isArray(parsed) ? parsed : (parsed.findings || []), deep });
      } catch { /* fall through to text */ }
    }

    // Fall back to text mode
    const textArgs = deep ? ['audit', '--deep'] : ['audit'];
    const textResult = await withTimeout(runCmd('security', textArgs), timeout);
    if (textResult.code !== 0 && !textResult.stdout.trim()) {
      return res.json({ available: false, error: 'security audit command not available', deep });
    }

    return res.json({ available: true, format: 'text', raw: textResult.stdout || '', deep });
  } catch {
    res.json({ available: false, error: 'Failed to run security audit', deep });
  }
});

// Lite API: Version check
app.get('/lite/api/version', wrapperAuth, async (req, res) => {
  const steps = [];
  let current = null;
  let latest = null;
  let baseVersion = null;
  let upgradeMethod = 'redeploy';
  let versions = [];
  let isNpmInstalled = false;

  // Check current running version
  try {
    const vResult = await runCmd('--version');
    const versionOutput = (vResult.stdout || '').trim().replace(/^openclaw\s*/i, '');
    // Extract clean version (e.g. "2026.3.8") stripping commit hash like "2026.3.8 (3caab92)"
    current = versionOutput.split(/\s/)[0] || null;
    steps.push('Current version: ' + (current || 'unknown'));
  } catch {
    steps.push('Could not determine current version');
  }

  // Check base (Docker-baked) version
  try {
    const baseResult = await runExec('node', ['-e', "try{const p=require('/usr/local/lib/node_modules/openclaw/package.json');console.log(p.version)}catch{console.log('unknown')}"]);
    baseVersion = (baseResult.stdout || '').trim() || null;
    if (baseVersion === 'unknown') baseVersion = null;
    steps.push('Base version: ' + (baseVersion || 'unknown'));
  } catch {
    steps.push('Could not determine base version');
  }

  // Check if npm-installed version exists (vs Docker-baked)
  const npmPrefix = process.env.NPM_CONFIG_PREFIX || '/data/.npm-global';
  const npmEntryPath = join(npmPrefix, 'lib', 'node_modules', 'openclaw', 'dist', 'entry.js');
  isNpmInstalled = existsSync(npmEntryPath);
  steps.push('npm-installed: ' + (isNpmInstalled ? 'yes' : 'no (using Docker base)'));

  // Check latest npm version and list available versions
  try {
    const npmResult = await runExec('npm', ['view', 'openclaw', 'version']);
    if (npmResult.code === 0 && npmResult.stdout.trim()) {
      latest = npmResult.stdout.trim();
      upgradeMethod = 'npm';
      steps.push('Latest npm version: ' + latest);
    } else {
      steps.push('npm package not found, use redeploy to update');
    }
  } catch {
    steps.push('npm check failed, use redeploy to update');
  }

  // List recent npm versions
  try {
    const versionsResult = await runExec('npm', ['view', 'openclaw', 'versions', '--json']);
    if (versionsResult.code === 0 && versionsResult.stdout.trim()) {
      const allVersions = JSON.parse(versionsResult.stdout.trim());
      // Return last 15 versions, newest first
      versions = Array.isArray(allVersions) ? allVersions.slice(-15).reverse() : [allVersions];
    }
  } catch { /* ignore */ }

  const upgradeAvailable = current && latest && current !== latest;
  res.json({ current, latest, baseVersion, upgradeAvailable, upgradeMethod, isNpmInstalled, versions, steps });
});

// Lite API: Restore from backup
app.post('/lite/api/restore', wrapperAuth, express.raw({ type: 'application/octet-stream', limit: '500mb' }), async (req, res) => {
  const steps = [];
  let autoBackupPath = null;

  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'No file uploaded', steps: ['No file data received'] });
    }
    steps.push('Received backup file (' + (req.body.length / 1024 / 1024).toFixed(1) + ' MB)');

    // Stop gateway if running
    if (isGatewayRunning()) {
      steps.push('Stopping gateway...');
      await stopGateway();
      steps.push('Gateway stopped');
    }

    // Create auto-backup
    steps.push('Creating auto-backup...');
    autoBackupPath = await createAutoBackup();
    steps.push('Auto-backup saved: ' + autoBackupPath);

    // Detect file type from filename header or magic bytes
    const filename = (req.headers['x-filename'] || '').toLowerCase();
    const isZip = filename.endsWith('.zip') ||
      (req.body.length >= 4 && req.body[0] === 0x50 && req.body[1] === 0x4B);

    // Write uploaded file to temp
    const ext = isZip ? '.zip' : '.tar.gz';
    const tempPath = join(tmpdir(), `openclaw-restore-${Date.now()}${ext}`);
    writeFileSync(tempPath, req.body);
    steps.push(`Wrote upload to temp file (${isZip ? 'zip' : 'tar.gz'})`);

    // Extract — backup contains .openclaw/ prefix, extract to parent of state dir
    const dataDir = join(OPENCLAW_STATE_DIR, '..');
    try {
      if (isZip) {
        const zip = await JSZip.loadAsync(req.body);
        for (const [relativePath, entry] of Object.entries(zip.files)) {
          if (entry.dir) {
            mkdirSync(join(dataDir, relativePath), { recursive: true });
            continue;
          }
          const outPath = join(dataDir, relativePath);
          mkdirSync(join(outPath, '..'), { recursive: true });
          const content = await entry.async('nodebuffer');
          writeFileSync(outPath, content);
        }
      } else {
        const extractResult = await runExec('tar', ['-xzf', tempPath, '-C', dataDir]);
        if (extractResult.code !== 0) {
          throw new Error(extractResult.stderr || 'tar extract failed');
        }
      }
      steps.push('Extracted backup to ' + dataDir);
    } catch (extractErr) {
      steps.push('Extract failed: ' + extractErr.message);
      // Rollback from auto-backup
      steps.push('Rolling back from auto-backup...');
      try {
        await runExec('tar', ['-xzf', autoBackupPath, '-C', dataDir]);
        steps.push('Rollback successful');
      } catch (rollbackErr) {
        steps.push('Rollback failed: ' + rollbackErr.message);
      }
      // Restart gateway with old config
      try {
        await startGateway();
        steps.push('Gateway restarted');
      } catch { steps.push('Gateway restart failed'); }
      return res.json({ success: false, error: 'Extract failed, rolled back', steps, autoBackupPath });
    }

    // Restart gateway
    steps.push('Starting gateway...');
    try {
      await startGateway();
      steps.push('Gateway started');
    } catch (startErr) {
      steps.push('Gateway start failed: ' + startErr.message);
    }

    res.json({ success: true, steps, autoBackupPath });
  } catch (error) {
    steps.push('Error: ' + error.message);
    // Try to restart gateway
    try { await startGateway(); steps.push('Gateway restarted'); } catch { /* ignore */ }
    res.status(500).json({ success: false, error: error.message, steps, autoBackupPath });
  }
});

// Lite API: Upgrade OpenClaw
app.post('/lite/api/upgrade', wrapperAuth, async (req, res) => {
  const steps = [];
  let autoBackupPath = null;
  // Accept version from body: { version: "2026.2.21" } or { version: "base" } or omit for latest
  const requestedVersion = req.body?.version || 'latest';
  const isRevert = requestedVersion === 'base';

  try {
    if (isRevert) {
      // Revert to Docker-baked version by removing npm-installed version
      const npmPrefix = process.env.NPM_CONFIG_PREFIX || '/data/.npm-global';
      const npmModulePath = join(npmPrefix, 'lib', 'node_modules', 'openclaw');
      const npmBinPath = join(npmPrefix, 'bin', 'openclaw');

      if (!existsSync(join(npmModulePath, 'dist', 'entry.js'))) {
        return res.json({ success: true, steps: ['Already using Docker base version'], newVersion: null });
      }

      steps.push('Reverting to Docker base version...');

      // Stop gateway
      if (isGatewayRunning()) {
        steps.push('Stopping gateway...');
        await stopGateway();
        steps.push('Gateway stopped');
      }

      // Create auto-backup
      steps.push('Creating auto-backup...');
      autoBackupPath = await createAutoBackup();
      steps.push('Auto-backup saved: ' + autoBackupPath);

      // Remove npm-installed openclaw
      steps.push('Removing npm-installed openclaw...');
      try {
        const { rmSync: rm } = await import('node:fs');
        rm(npmModulePath, { recursive: true, force: true });
        try { rm(npmBinPath, { force: true }); } catch { /* might not exist */ }
        steps.push('Removed npm openclaw module');
      } catch (rmErr) {
        steps.push('Remove failed: ' + rmErr.message);
        try { await startGateway(); steps.push('Gateway restarted'); } catch { steps.push('Gateway restart failed'); }
        return res.json({ success: false, error: 'Failed to remove npm version', steps, autoBackupPath });
      }

      // Verify base version is now active
      const verifyResult = await runCmd('--version');
      const versionOut = (verifyResult.stdout || '').trim().replace(/^openclaw\s*/i, '');
      const newVersion = versionOut.split(/\s/)[0] || '';
      steps.push('Active version: ' + (newVersion || 'unknown'));

      // Restart gateway
      steps.push('Starting gateway...');
      try {
        await startGateway();
        steps.push('Gateway started');
      } catch (startErr) {
        steps.push('Gateway start failed: ' + startErr.message);
      }

      return res.json({ success: true, steps, autoBackupPath, newVersion });
    }

    // Install specific version or latest
    const versionSpec = requestedVersion === 'latest' ? 'latest' : requestedVersion;

    // Check if npm package exists
    steps.push('Checking npm registry...');
    const npmCheck = await runExec('npm', ['view', `openclaw@${versionSpec}`, 'version']);
    if (npmCheck.code !== 0 || !npmCheck.stdout.trim()) {
      return res.json({
        success: false,
        error: `openclaw@${versionSpec} not found. Redeploy on Railway to update.`,
        upgradeMethod: 'redeploy',
        steps: [`npm package openclaw@${versionSpec} not available`, 'Redeploy your Railway service to get the desired version']
      });
    }
    const targetVersion = npmCheck.stdout.trim();
    steps.push('Target version: ' + targetVersion);

    // Stop gateway
    if (isGatewayRunning()) {
      steps.push('Stopping gateway...');
      await stopGateway();
      steps.push('Gateway stopped');
    }

    // Create auto-backup
    steps.push('Creating auto-backup...');
    autoBackupPath = await createAutoBackup();
    steps.push('Auto-backup saved: ' + autoBackupPath);

    // Install requested version
    steps.push(`Installing openclaw@${versionSpec}...`);
    const installResult = await runExec('npm', ['install', '-g', `openclaw@${versionSpec}`]);
    if (installResult.code !== 0) {
      steps.push('Install failed: ' + (installResult.stderr || 'unknown error'));
      // Restart gateway with old version
      try { await startGateway(); steps.push('Gateway restarted with old version'); } catch { steps.push('Gateway restart failed'); }
      return res.json({ success: false, error: 'npm install failed', steps, autoBackupPath });
    }
    steps.push('Install completed');

    // Verify new version
    const verifyResult = await runCmd('--version');
    const versionOut = (verifyResult.stdout || '').trim().replace(/^openclaw\s*/i, '');
    const newVersion = versionOut.split(/\s/)[0] || '';
    steps.push('New version: ' + (newVersion || 'unknown'));

    // Restart gateway
    steps.push('Starting gateway...');
    try {
      await startGateway();
      steps.push('Gateway started');
    } catch (startErr) {
      steps.push('Gateway start failed: ' + startErr.message);
    }

    res.json({ success: true, steps, autoBackupPath, newVersion });
  } catch (error) {
    steps.push('Error: ' + error.message);
    try { await startGateway(); steps.push('Gateway restarted'); } catch { /* ignore */ }
    res.status(500).json({ success: false, error: error.message, steps, autoBackupPath });
  }
});

// API: Serve schemas + form metadata for client-side validation and form generation
app.get('/api/schemas', wrapperAuth, (req, res) => {
  res.json(getAllSchemas());
});

// Create reverse proxy
const { middleware: proxyMiddleware, upgradeHandler } = createProxy(getGatewayToken);

// Protect all /openclaw paths (SPA, assets, API) with setup password
app.use('/openclaw', wrapperAuth);

// Redirect /openclaw (and subpaths on refresh) to include gateway token so the SPA can authenticate.
// v2026.3.13+ reads the token from URL fragment (#token=xxx), not query params.
// We keep ?token= in the query as a loop-breaker (fragments aren't sent to the server)
// and for backward compat with older SPA versions.
const openclawHandler = (req, res, next) => {
  // If token already in query, let the proxy serve the request (prevents redirect loop)
  if (req.query.token) {
    return next();
  }
  // Only redirect navigation requests (HTML pages), not assets/API/XHR
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (!acceptsHtml) {
    return next();
  }
  if (!isGatewayRunning()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'OpenClaw gateway is not running. Visit /dashboard to configure and start it.'
    });
  }
  const token = getGatewayToken();
  // Preserve existing query params (e.g. ?session=...) and add token
  const url = new URL(req.originalUrl, `http://${req.headers.host}`);
  url.searchParams.set('token', token);
  // Append token as URL fragment for v2026.3.13+ SPA (reads #token=<value>, stores in sessionStorage)
  res.redirect(url.pathname + url.search + '#token=' + encodeURIComponent(token));
};

app.get('/openclaw', openclawHandler);
app.post('/openclaw', openclawHandler);
app.get('/openclaw/{*path}', openclawHandler);  // catch subpath refreshes like /openclaw/chat?session=...

// Proxy all other requests to gateway (when running)
// Note: Using no path argument to avoid Express 5 stripping req.url
// (/{*path} would set req.url to "/" for every request, breaking the proxy)
app.use((req, res, next) => {
  if (!isGatewayRunning()) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'OpenClaw gateway is not running. Visit /dashboard to configure and start it.'
    });
  }
  proxyMiddleware(req, res);
});

// Create HTTP server
const server = createServer(app);

// Initialize terminal WebSocket server (handles /onboard/ws and /lite/ws)
createTerminalServer(server);

// Handle WebSocket upgrades for gateway proxy
// Note: Terminal WebSocket upgrades are handled by createTerminalServer
server.on('upgrade', (req, socket, head) => {
  // Skip health check endpoints
  if (req.url.startsWith('/health')) {
    socket.destroy();
    return;
  }

  // Skip terminal endpoints (handled by terminal server)
  if (req.url.startsWith('/onboard/ws') || req.url.startsWith('/lite/ws')) {
    return; // Already handled by createTerminalServer
  }

  // Proxy WebSocket to gateway if running
  if (!isGatewayRunning()) {
    socket.destroy();
    return;
  }

  upgradeHandler(req, socket, head);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // Close terminal sessions
  closeAllSessions();

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Stop gateway
  await stopGateway();

  console.log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenClaw wrapper server listening on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Lite panel: http://localhost:${PORT}/lite`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Check if gateway should auto-start (if already configured)
  const configFile = join(OPENCLAW_STATE_DIR, 'openclaw.json');
  if (existsSync(configFile)) {
    console.log('Configuration found, auto-starting gateway...');
    startGateway().catch(err => {
      console.error('Failed to auto-start gateway:', err.message);
    });
  } else {
    ensureOpenClawConfigFromEnv()
      .then((boot) => {
        if (boot.configured && boot.created) {
          console.log('Bootstrapped configuration for SaaS, auto-starting gateway...');
          startGateway().catch(err => {
            console.error('Failed to auto-start gateway:', err.message);
          });
        } else {
          console.log('No configuration found. Provide LLM Gateway config (env or Supabase app_settings), then visit /dashboard.');
        }
      })
      .catch(() => {
        console.log('No configuration found. Provide LLM Gateway config (env or Supabase app_settings), then visit /dashboard.');
      });
  }
});
