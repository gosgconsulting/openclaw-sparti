/**
 * Centralised Supabase data access layer.
 *
 * Provides:
 *   - getAdminClient()        — lazy singleton service-role client
 *   - getUserClient(req)      — RLS-scoped user client from request
 *   - getAppSetting(key)      — cached app_settings reader (10-min TTL)
 *   - getLlmGatewayConfig()   — env first, then app_settings['llm_gateway']
 *   - resolveComposioApiKey() — env first, then app_settings['composio'].api_key
 *
 * All public functions return null / '' on graceful failure (missing env vars,
 * Supabase errors) instead of throwing, so callers can decide how to handle
 * missing data rather than crashing mid-request.
 */

import { createSupabaseClient, createSupabaseAdminClient } from '../supabase.js';

// ── Admin client singleton ────────────────────────────────────────────────────

let _adminClient = null;

/**
 * Returns a lazily-initialised service-role Supabase client.
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function getAdminClient() {
  if (_adminClient) return _adminClient;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  _adminClient = createSupabaseAdminClient();
  return _adminClient;
}

// ── User client helper ────────────────────────────────────────────────────────

/**
 * Returns a RLS-scoped Supabase client for the current request.
 * Use in any route handler that already has req.supabaseAccessToken set by requireUser().
 *
 * @param {import('express').Request} req
 */
export function getUserClient(req) {
  return createSupabaseClient({ accessToken: req.supabaseAccessToken });
}

/**
 * Returns the correct Supabase client for the request, handling the dual
 * browser-session / bot-auth modes used by sparti-context routes.
 *
 * - Browser (requireUser): RLS-scoped user client
 * - Bot (requireUserOrBot + SETUP_PASSWORD): service-role admin client
 *
 * @param {import('express').Request} req
 */
export function getClientForRequest(req) {
  if (req.isBotAuth) return getAdminClient();
  return getUserClient(req);
}

/**
 * When the admin client is used (no RLS) the caller must manually filter by
 * user_id to prevent cross-user leakage. Returns the query unchanged for
 * browser sessions where RLS handles isolation.
 *
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {import('express').Request} req
 */
export function scopeToUser(query, req) {
  if (req.isBotAuth) return query.eq('user_id', req.user.id);
  return query;
}

// ── App settings cache ────────────────────────────────────────────────────────

const _settingsCache = new Map(); // key → { value, expiresAt }
const SETTINGS_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Read a row from the public.app_settings table.
 * Results are cached in-process for `ttlMs` milliseconds (default 10 min).
 *
 * Returns the parsed `value` JSONB object, or null on any error / missing row.
 *
 * @param {string} key
 * @param {number} [ttlMs]
 */
export async function getAppSetting(key, ttlMs = SETTINGS_TTL_MS) {
  const now = Date.now();
  const cached = _settingsCache.get(key);
  if (cached && now < cached.expiresAt) return cached.value;

  try {
    const admin = getAdminClient();
    if (!admin) return null;

    const { data, error } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const value = (!error && data?.value && typeof data.value === 'object') ? data.value : null;
    _settingsCache.set(key, { value, expiresAt: now + ttlMs });
    return value;
  } catch {
    return null;
  }
}

/**
 * Invalidate a cached app_setting entry (e.g. after an update).
 * @param {string} key
 */
export function invalidateAppSetting(key) {
  _settingsCache.delete(key);
}

// ── Instance owner resolver ───────────────────────────────────────────────────

/**
 * Resolve the Supabase user_id that owns this OpenClaw deployment.
 *
 * In SaaS mode each deployment has exactly one `instances` row whose `user_id`
 * is the account that first visited /dashboard (e.g. oliver@gosgconsulting.com).
 * This lets bot-facing endpoints and dashboard fallbacks find the right account
 * without relying on environment variables.
 *
 * Returns the user_id string or null when the table is empty / unavailable.
 */
export async function resolveInstanceOwner() {
  try {
    const admin = getAdminClient();
    if (!admin) return null;

    const { data } = await admin
      .from('instances')
      .select('user_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.user_id || null;
  } catch {
    return null;
  }
}

// ── Shared config resolvers ───────────────────────────────────────────────────

/**
 * Resolve LLM Gateway config.
 * Priority: LLM_GATEWAY_* env vars → app_settings(key='llm_gateway').
 * Returns a config object or null when neither source is available.
 */
export async function getLlmGatewayConfig() {
  const baseUrl = process.env.LLM_GATEWAY_BASE_URL?.trim();
  const apiKey = process.env.LLM_GATEWAY_API_KEY?.trim();
  const modelId = process.env.LLM_GATEWAY_MODEL_ID?.trim();

  if (baseUrl && apiKey && modelId) {
    return {
      baseUrl,
      apiKey,
      modelId,
      providerId: (process.env.LLM_GATEWAY_PROVIDER_ID || 'llm-gateway').trim(),
      contextWindow: process.env.LLM_GATEWAY_CONTEXT_WINDOW
        ? parseInt(process.env.LLM_GATEWAY_CONTEXT_WINDOW, 10) || undefined
        : undefined,
      maxTokens: process.env.LLM_GATEWAY_MAX_TOKENS
        ? parseInt(process.env.LLM_GATEWAY_MAX_TOKENS, 10) || undefined
        : undefined,
    };
  }

  const v = await getAppSetting('llm_gateway');
  if (!v) return null;

  return {
    baseUrl: String(v.base_url || v.baseUrl || '').trim(),
    apiKey: String(v.api_key || v.apiKey || '').trim(),
    modelId: String(v.model_id || v.modelId || '').trim(),
    providerId: String(v.provider_id || v.providerId || 'llm-gateway').trim(),
    contextWindow: v.context_window ?? v.contextWindow,
    maxTokens: v.max_tokens ?? v.maxTokens,
  };
}

/**
 * Resolve the shared Composio API key.
 * Priority: COMPOSIO_API_KEY env var → app_settings(key='composio').api_key.
 * Returns '' when neither source is available.
 */
export async function resolveComposioApiKey() {
  const fromEnv = (process.env.COMPOSIO_API_KEY || '').trim();
  if (fromEnv) return fromEnv;

  const v = await getAppSetting('composio');
  if (!v) return '';
  return String(v.api_key || v.apiKey || '').trim();
}
