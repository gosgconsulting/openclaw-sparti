/**
 * Sparti Context Router
 *
 * Mounted at /api/sparti in server.js.
 * All routes require Supabase auth via requireUser().
 *
 * Provides read access to the user's Sparti account data:
 *   - brands
 *   - agents (ai_agents + custom_agents)
 *   - projects
 *   - copilot tools (copilot_instances, copilot_templates, app_tools)
 *
 * Also exposes:
 *   - POST /api/sparti/agents/:id/launch  — launch an agent session via llmgateway-chat edge fn
 *   - POST /api/sparti/agents/:id/chat    — send a message to an agent via llmgateway-chat edge fn
 *   - POST /api/sparti/edge/:slug         — invoke any Supabase edge function by slug
 *   - GET  /api/sparti/edge-functions     — list available edge functions
 *
 * Never exposes service role key or raw API keys to the browser.
 * All Supabase calls use the user's access token (RLS-scoped).
 * Edge function calls use SUPABASE_SERVICE_ROLE_KEY server-side.
 */

import { Router } from 'express';
import { requireUserOrBot } from '../auth-supabase.js';
import { createSupabaseClient, createSupabaseAdminClient } from '../supabase.js';
import { emitAudit } from '../audit.js';

const router = Router();

router.use(requireUserOrBot());

/**
 * Returns a Supabase client scoped to the current request.
 * - Browser sessions: RLS-scoped user client (access token from cookie)
 * - Bot sessions (SETUP_PASSWORD + x-user-id): service-role admin client
 *   so queries bypass RLS but are still filtered by user_id where needed.
 */
function getSupabaseForRequest(req) {
  if (req.isBotAuth) {
    return createSupabaseAdminClient();
  }
  return createSupabaseClient({ accessToken: req.supabaseAccessToken });
}

/**
 * When the bot uses the admin client (no RLS), we must manually filter by
 * user_id to prevent cross-user data leakage.
 * Returns the query unchanged for browser sessions (RLS handles it).
 */
function scopeToUser(query, req) {
  if (req.isBotAuth) {
    return query.eq('user_id', req.user.id);
  }
  return query;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function edgeFunctionUrl(slug) {
  return `${SUPABASE_URL}/functions/v1/${encodeURIComponent(slug)}`;
}

/**
 * Call a Supabase edge function server-side.
 * Uses the service role key so the function can access protected resources.
 * The user's JWT is forwarded as x-user-token for functions that need it.
 */
async function callEdgeFunction(slug, body, userAccessToken) {
  const url = edgeFunctionUrl(slug);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY}`,
  };
  if (userAccessToken) {
    headers['x-user-token'] = userAccessToken;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : `Edge function ${slug} returned HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json ?? text;
}

// ── Brands ────────────────────────────────────────────────────────────────────

router.get('/brands', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { data, error } = await scopeToUser(
    supabase
      .from('brands')
      .select('id,name,description,logo_url,industry,brand_voice,website,country,language,created_at')
      .order('created_at', { ascending: false }),
    req,
  );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ brands: data || [] });
});

router.get('/brands/:id', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { data, error } = await scopeToUser(
    supabase
      .from('brands')
      .select('id,name,description,logo_url,industry,brand_voice,website,country,language,key_selling_points,colors,typography,created_at,updated_at')
      .eq('id', req.params.id),
    req,
  ).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Brand not found' });
  return res.json({ brand: data });
});

// ── Agents ────────────────────────────────────────────────────────────────────

/**
 * List all agents: combines ai_agents (Sparti built-in) and custom_agents (user-created).
 * Both tables are RLS-scoped to the authenticated user.
 */
router.get('/agents', async (req, res) => {
  const supabase = getSupabaseForRequest(req);

  const [aiResult, customResult] = await Promise.all([
    scopeToUser(
      supabase
        .from('ai_agents')
        .select('id,name,instructions,workspace_id,is_active,usage_count,last_used_at,created_at')
        .order('name', { ascending: true }),
      req,
    ),
    scopeToUser(
      supabase
        .from('custom_agents')
        .select('id,name,description,icon,category,instructions,is_active,usage_count,last_used_at,created_at')
        .order('name', { ascending: true }),
      req,
    ),
  ]);

  const agents = [
    ...(aiResult.data || []).map(a => ({ ...a, source: 'ai_agents' })),
    ...(customResult.data || []).map(a => ({ ...a, source: 'custom_agents' })),
  ];

  const errors = [aiResult.error?.message, customResult.error?.message].filter(Boolean);
  return res.json({ agents, errors: errors.length ? errors : undefined });
});

router.get('/agents/:id', async (req, res) => {
  const supabase = getSupabaseForRequest(req);

  // Try ai_agents first, then custom_agents
  const { data: aiAgent } = await scopeToUser(
    supabase
      .from('ai_agents')
      .select('id,name,instructions,questions,workspace_id,is_active,usage_count,last_used_at,created_at,updated_at')
      .eq('id', req.params.id),
    req,
  ).maybeSingle();

  if (aiAgent) return res.json({ agent: { ...aiAgent, source: 'ai_agents' } });

  const { data: customAgent, error } = await scopeToUser(
    supabase
      .from('custom_agents')
      .select('id,name,description,icon,category,instructions,questions,is_active,usage_count,last_used_at,created_at,updated_at')
      .eq('id', req.params.id),
    req,
  ).maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!customAgent) return res.status(404).json({ error: 'Agent not found' });
  return res.json({ agent: { ...customAgent, source: 'custom_agents' } });
});

// ── Projects ──────────────────────────────────────────────────────────────────

router.get('/projects', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { data, error } = await scopeToUser(
    supabase
      .from('projects')
      .select('id,title,description,type,status,brand_id,is_active,created_at,updated_at')
      .order('created_at', { ascending: false }),
    req,
  );
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ projects: data || [] });
});

router.get('/projects/:id', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { data, error } = await scopeToUser(
    supabase
      .from('projects')
      .select('id,title,description,type,content,status,brand_id,global_prompt,project_knowledge,is_active,created_at,updated_at')
      .eq('id', req.params.id),
    req,
  ).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Project not found' });
  return res.json({ project: data });
});

// ── Copilot Tools ─────────────────────────────────────────────────────────────

/**
 * List copilot tools: combines copilot_instances (user's deployed copilots),
 * copilot_templates (available templates), and app_tools (platform tools).
 */
router.get('/copilot-tools', async (req, res) => {
  const supabase = getSupabaseForRequest(req);

  const [instancesResult, templatesResult, appToolsResult] = await Promise.all([
    scopeToUser(
      supabase
        .from('copilot_instances')
        .select('id,name,status,template_id,brand_id,created_at,updated_at')
        .order('created_at', { ascending: false }),
      req,
    ),
    supabase
      .from('copilot_templates')
      .select('id,name,slug,description,base_copilot_type,is_template,created_at')
      .eq('is_template', true)
      .order('name', { ascending: true }),
    supabase
      .from('app_tools')
      .select('id,name,slug,description,icon,is_active')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  return res.json({
    copilot_instances: instancesResult.data || [],
    copilot_templates: templatesResult.data || [],
    app_tools: appToolsResult.data || [],
  });
});

router.get('/copilot-tools/instances/:id', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { data, error } = await scopeToUser(
    supabase
      .from('copilot_instances')
      .select('id,name,status,template_id,brand_id,custom_configuration,custom_prompts,created_at,updated_at')
      .eq('id', req.params.id),
    req,
  ).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Copilot instance not found' });
  return res.json({ instance: data });
});

// ── Edge Functions ────────────────────────────────────────────────────────────

/**
 * List available Supabase edge functions.
 * Reads from SUPABASE_EDGE_FUNCTIONS env var (comma-separated slugs) or
 * falls back to a hardcoded curated list of the most useful ones.
 */
router.get('/edge-functions', (req, res) => {
  const fromEnv = process.env.SUPABASE_EDGE_FUNCTIONS || '';
  const slugsFromEnv = fromEnv.split(',').map(s => s.trim()).filter(Boolean);

  const defaultFunctions = [
    { slug: 'llmgateway-chat', name: 'LLM Gateway Chat', description: 'Chat with any LLM via the gateway' },
    { slug: 'kie-chat', name: 'Kie Chat', description: 'Chat via Kie.ai' },
    { slug: 'workflow-ai', name: 'Workflow AI', description: 'Run AI workflow automation' },
    { slug: 'execute-workflow', name: 'Execute Workflow', description: 'Execute a saved workflow' },
    { slug: 'content-writing-workflow', name: 'Content Writing Workflow', description: 'Run the content writing pipeline' },
    { slug: 'content-writing-unified', name: 'Content Writing Unified', description: 'Unified content writing endpoint' },
    { slug: 'articles-workflow', name: 'Articles Workflow', description: 'Full article generation workflow' },
    { slug: 'brand-voice-profile', name: 'Brand Voice Profile', description: 'Generate or retrieve brand voice profile' },
    { slug: 'generate-featured-image', name: 'Generate Featured Image', description: 'Generate a featured image for content' },
    { slug: 'keyword-research', name: 'Keyword Research', description: 'Run keyword research for a topic' },
    { slug: 'ai-seo-analysis', name: 'AI SEO Analysis', description: 'Analyze SEO for a URL or content' },
    { slug: 'composio-proxy', name: 'Composio Proxy', description: 'Proxy Composio tool calls' },
    { slug: 'integrations-status', name: 'Integrations Status', description: 'Check status of all integrations' },
    { slug: 'test-sparti-connection', name: 'Test Sparti Connection', description: 'Test connectivity to Sparti services' },
    { slug: 'sync-article-sparti', name: 'Sync Article to Sparti', description: 'Sync a generated article to Sparti' },
    { slug: 'generate-colors', name: 'Generate Colors', description: 'Generate brand color palette' },
    { slug: 'quick-setup-website-analysis', name: 'Quick Setup Website Analysis', description: 'Analyze a website for quick setup' },
    { slug: 'ai-lead-analysis', name: 'AI Lead Analysis', description: 'Analyze and score leads with AI' },
    { slug: 'perplexity-deep-search', name: 'Perplexity Deep Search', description: 'Deep web search via Perplexity' },
    { slug: 'firecrawl-scrape', name: 'Firecrawl Scrape', description: 'Scrape a URL with Firecrawl' },
    { slug: 'firecrawl-search', name: 'Firecrawl Search', description: 'Search the web with Firecrawl' },
    { slug: 'kie-image', name: 'Kie Image', description: 'Generate images via Kie.ai' },
    { slug: 'kie-video', name: 'Kie Video', description: 'Generate videos via Kie.ai' },
    { slug: 'llmgateway-image', name: 'LLM Gateway Image', description: 'Generate images via LLM Gateway' },
  ];

  if (slugsFromEnv.length > 0) {
    const slugSet = new Set(slugsFromEnv);
    const filtered = defaultFunctions.filter(f => slugSet.has(f.slug));
    const extra = slugsFromEnv
      .filter(s => !defaultFunctions.some(f => f.slug === s))
      .map(s => ({ slug: s, name: s, description: '' }));
    return res.json({ functions: [...filtered, ...extra] });
  }

  return res.json({ functions: defaultFunctions });
});

// ── Agent Launch ──────────────────────────────────────────────────────────────

/**
 * Launch an agent: creates a new chat session with the agent's instructions
 * loaded as the system prompt, then sends an optional initial message.
 *
 * Body: { message?, brand_id?, project_id?, model? }
 * Returns: { session_id?, reply, agent }
 */
router.post('/agents/:id/launch', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { message, brand_id, project_id, model } = req.body || {};

  // Load agent
  const { data: aiAgent } = await supabase
    .from('ai_agents')
    .select('id,name,instructions,questions')
    .eq('id', req.params.id)
    .maybeSingle();

  const { data: customAgent } = !aiAgent
    ? await supabase
        .from('custom_agents')
        .select('id,name,instructions,questions')
        .eq('id', req.params.id)
        .maybeSingle()
    : { data: null };

  const agent = aiAgent || customAgent;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  // Optionally enrich system prompt with brand context
  let brandContext = '';
  if (brand_id) {
    const { data: brand } = await supabase
      .from('brands')
      .select('name,description,brand_voice,industry,key_selling_points')
      .eq('id', brand_id)
      .maybeSingle();
    if (brand) {
      brandContext = `\n\nBrand context:\n- Name: ${brand.name}\n- Industry: ${brand.industry || 'N/A'}\n- Brand voice: ${brand.brand_voice || 'N/A'}\n- Description: ${brand.description || 'N/A'}`;
      if (Array.isArray(brand.key_selling_points) && brand.key_selling_points.length > 0) {
        brandContext += `\n- Key selling points: ${brand.key_selling_points.join(', ')}`;
      }
    }
  }

  // Optionally enrich with project context
  let projectContext = '';
  if (project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('title,description,global_prompt')
      .eq('id', project_id)
      .maybeSingle();
    if (project) {
      projectContext = `\n\nProject context:\n- Title: ${project.title}\n- Description: ${project.description || 'N/A'}`;
      if (project.global_prompt) projectContext += `\n- Instructions: ${project.global_prompt}`;
    }
  }

  const systemPrompt = [
    typeof agent.instructions === 'string'
      ? agent.instructions
      : JSON.stringify(agent.instructions || ''),
    brandContext,
    projectContext,
  ].filter(Boolean).join('');

  const userMessage = message || `Hello, I'm ready to work with you as ${agent.name}.`;

  try {
    const result = await callEdgeFunction('llmgateway-chat', {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      model: model || undefined,
      agent_id: agent.id,
      agent_name: agent.name,
    }, req.supabaseAccessToken);

    emitAudit(supabase, {
      userId: req.user.id,
      eventType: 'bot.agent.launched',
      actor: req.user.email || req.user.id,
      payload: { agentId: agent.id, agentName: agent.name, brand_id: brand_id || null, project_id: project_id || null },
    });

    return res.json({
      agent: { id: agent.id, name: agent.name },
      reply: result?.reply || result?.content || result?.message || result,
      session_id: result?.session_id || null,
    });
  } catch (err) {
    return res.status(502).json({ error: `Agent launch failed: ${err.message}` });
  }
});

// ── Agent Chat ────────────────────────────────────────────────────────────────

/**
 * Chat with an agent.
 * Body: { message, history?, brand_id?, project_id?, model? }
 * Returns: { reply, agent }
 */
router.post('/agents/:id/chat', async (req, res) => {
  const supabase = getSupabaseForRequest(req);
  const { message, history, brand_id, project_id, model } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const { data: aiAgent } = await supabase
    .from('ai_agents')
    .select('id,name,instructions')
    .eq('id', req.params.id)
    .maybeSingle();

  const { data: customAgent } = !aiAgent
    ? await supabase
        .from('custom_agents')
        .select('id,name,instructions')
        .eq('id', req.params.id)
        .maybeSingle()
    : { data: null };

  const agent = aiAgent || customAgent;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  let brandContext = '';
  if (brand_id) {
    const { data: brand } = await supabase
      .from('brands')
      .select('name,brand_voice,industry')
      .eq('id', brand_id)
      .maybeSingle();
    if (brand) {
      brandContext = `\n\nBrand: ${brand.name} | Industry: ${brand.industry || 'N/A'} | Voice: ${brand.brand_voice || 'N/A'}`;
    }
  }

  let projectContext = '';
  if (project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('title,global_prompt')
      .eq('id', project_id)
      .maybeSingle();
    if (project) {
      projectContext = `\n\nProject: ${project.title}${project.global_prompt ? ` | ${project.global_prompt}` : ''}`;
    }
  }

  const systemPrompt = [
    typeof agent.instructions === 'string'
      ? agent.instructions
      : JSON.stringify(agent.instructions || ''),
    brandContext,
    projectContext,
  ].filter(Boolean).join('');

  const messages = [
    ...(Array.isArray(history) ? history.filter(m => m?.role && m?.content) : []),
    { role: 'user', content: String(message).trim() },
  ];

  try {
    const result = await callEdgeFunction('llmgateway-chat', {
      system: systemPrompt,
      messages,
      model: model || undefined,
      agent_id: agent.id,
      agent_name: agent.name,
    }, req.supabaseAccessToken);

    emitAudit(supabase, {
      userId: req.user.id,
      eventType: 'bot.agent.chat',
      actor: req.user.email || req.user.id,
      payload: { agentId: agent.id, agentName: agent.name, messageLength: String(message).trim().length, brand_id: brand_id || null },
    });

    return res.json({
      agent: { id: agent.id, name: agent.name },
      reply: result?.reply || result?.content || result?.message || result,
    });
  } catch (err) {
    return res.status(502).json({ error: `Agent chat failed: ${err.message}` });
  }
});

// ── Edge Function Invocation ──────────────────────────────────────────────────

/**
 * Invoke any Supabase edge function by slug.
 * Body: arbitrary JSON passed through to the function.
 * The user's access token is forwarded as x-user-token.
 *
 * This is the "project-doc-planner" trigger endpoint and general-purpose
 * edge function launcher for the bot.
 */
router.post('/edge/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid edge function slug' });
  }

  const supabase = getSupabaseForRequest(req);
  try {
    const result = await callEdgeFunction(slug, req.body || {}, req.supabaseAccessToken);
    emitAudit(supabase, {
      userId: req.user.id,
      eventType: 'bot.edge_function.invoked',
      actor: req.user.email || req.user.id,
      payload: { slug, body: req.body || {} },
    });
    return res.json({ ok: true, result });
  } catch (err) {
    emitAudit(supabase, {
      userId: req.user.id,
      eventType: 'bot.edge_function.failed',
      actor: req.user.email || req.user.id,
      payload: { slug, error: err.message },
    });
    return res.status(502).json({ error: err.message });
  }
});

// ── Account Summary ───────────────────────────────────────────────────────────

/**
 * Single endpoint that returns a summary of the user's Sparti account:
 * brand count, agent count, project count, copilot instance count, app tool count.
 * Useful for the bot to give a quick overview.
 */
router.get('/summary', async (req, res) => {
  const supabase = getSupabaseForRequest(req);

  const [brands, aiAgents, customAgents, projects, copilotInstances, appTools] = await Promise.all([
    supabase.from('brands').select('id', { count: 'exact', head: true }),
    supabase.from('ai_agents').select('id', { count: 'exact', head: true }),
    supabase.from('custom_agents').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('copilot_instances').select('id', { count: 'exact', head: true }),
    supabase.from('app_tools').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  return res.json({
    summary: {
      brands: brands.count ?? 0,
      agents: (aiAgents.count ?? 0) + (customAgents.count ?? 0),
      ai_agents: aiAgents.count ?? 0,
      custom_agents: customAgents.count ?? 0,
      projects: projects.count ?? 0,
      copilot_instances: copilotInstances.count ?? 0,
      app_tools: appTools.count ?? 0,
    },
  });
});

export default router;
