import { Composio } from '@composio/core';

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

function toSafeString(v) {
  if (v == null) return '';
  return String(v);
}

function getComposioClient(explicitApiKey) {
  const apiKey = (explicitApiKey || process.env.COMPOSIO_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing COMPOSIO_API_KEY');
  return new Composio({ apiKey });
}

/**
 * List available Composio apps (connectors catalog).
 * Uses server-side API key; never call from browser.
 */
export async function listComposioApps({ apiKey, limit = 50 } = {}) {
  const key = toSafeString(apiKey).trim();
  if (!key) {
    throw new Error('Missing COMPOSIO_API_KEY');
  }

  const { signal, done } = withTimeout(12000);
  try {
    const res = await fetch('https://backend.composio.dev/api/v1/apps', {
      method: 'GET',
      headers: {
        'x-api-key': key,
        'accept': 'application/json',
      },
      signal,
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (!res.ok) {
      const msg = (json && (json.error || json.message)) ? (json.error || json.message) : `Composio HTTP ${res.status}`;
      throw new Error(msg);
    }

    const raw = Array.isArray(json)
      ? json
      : (Array.isArray(json?.apps) ? json.apps : (Array.isArray(json?.data) ? json.data : []));

    const items = raw
      .slice(0, Math.max(0, Math.min(200, limit)))
      .map(a => ({
        key: toSafeString(a?.key || a?.name || a?.app || a?.id).trim(),
        name: toSafeString(a?.name || a?.key || a?.app || a?.id).trim(),
        description: toSafeString(a?.description || a?.short_description || a?.summary || '').trim(),
      }))
      .filter(a => a.key || a.name);

    return items;
  } finally {
    done();
  }
}

/**
 * Initiate a Composio OAuth connection for a user.
 * Returns a redirectUrl (Connect Link) the browser should navigate to.
 * Never call from browser — uses the shared server API key.
 *
 * The Connect Link is short-lived: it expires if the user abandons the OAuth
 * flow without completing it (Composio leaves the connection in INITIATED state
 * until it expires). Always generate a fresh link on each connect/reconnect click.
 *
 * @param {string} userId - Supabase user UUID (used as Composio user_id)
 * @param {string} toolkitKey - Composio toolkit slug (e.g. 'google_super', 'github')
 * @param {string} callbackUrl - URL Composio redirects to after auth
 * @param {string} [apiKey] - Explicit API key; falls back to COMPOSIO_API_KEY env var
 * @returns {Promise<{ redirectUrl: string, connectionRequestId: string }>}
 */
export async function initiateComposioConnection(userId, toolkitKey, callbackUrl, apiKey) {
  const composio = getComposioClient(apiKey);
  const session = await composio.create(userId);
  const connectionRequest = await session.authorize(toolkitKey, { callbackUrl });
  return {
    redirectUrl: connectionRequest.redirectUrl,
    connectionRequestId: connectionRequest.id ?? connectionRequest.connectionRequestId ?? '',
  };
}

/**
 * Generate a fresh Composio Connect Link for a user + toolkit.
 * Convenience wrapper over initiateComposioConnection that builds the
 * callback URL from the request origin automatically.
 *
 * The link is single-use and short-lived (expires on abandonment).
 * Call this on every "Connect" or "Reconnect" click — never cache the URL.
 *
 * One shared API key is used for all users on this server (passed from server.js
 * via getComposioApiKey(), which checks COMPOSIO_API_KEY env var then Supabase
 * app_settings). Individual user sessions are scoped by userId inside Composio.
 *
 * @param {string} userId - Supabase user UUID
 * @param {string} toolkitKey - Composio toolkit slug
 * @param {string} origin - Request origin (e.g. 'https://your-app.railway.app')
 * @param {string} [apiKey] - Explicit API key; falls back to COMPOSIO_API_KEY env var
 * @returns {Promise<{ redirectUrl: string, connectionRequestId: string }>}
 */
export async function generateConnectLink(userId, toolkitKey, origin, apiKey) {
  const callbackUrl = `${origin}/dashboard/connectors/callback?toolkit=${encodeURIComponent(toolkitKey)}`;
  return initiateComposioConnection(userId, toolkitKey, callbackUrl, apiKey);
}

/**
 * List connected accounts for a user from Composio.
 * Returns an array of { toolkit_key, connected_account_id, status }.
 * Never call from browser.
 *
 * @param {string} userId - Supabase user UUID
 * @param {string} [apiKey] - Explicit API key; falls back to COMPOSIO_API_KEY env var
 * @returns {Promise<Array<{ toolkit_key: string, connected_account_id: string, status: string }>>}
 */
export async function listComposioConnectedAccounts(userId, apiKey) {
  const composio = getComposioClient(apiKey);
  const session = await composio.create(userId);
  const toolkits = await session.toolkits();
  const items = Array.isArray(toolkits?.items) ? toolkits.items : [];
  return items
    .filter(t => t.connection?.connectedAccount?.id || t.connection?.connected_account?.id)
    .map(t => ({
      toolkit_key: toSafeString(t.slug || t.key || t.name),
      connected_account_id: toSafeString(
        t.connection?.connectedAccount?.id ?? t.connection?.connected_account?.id ?? ''
      ),
      status: t.connection?.isActive || t.connection?.is_active ? 'active' : 'inactive',
    }));
}

/**
 * Disconnect a Composio connected account.
 * Never call from browser.
 *
 * @param {string} connectedAccountId - The Composio connected_account_id to disconnect
 * @param {string} [apiKey] - Explicit API key; falls back to COMPOSIO_API_KEY env var
 * @returns {Promise<void>}
 */
export async function disconnectComposioAccount(connectedAccountId, apiKey) {
  const resolvedKey = (apiKey || process.env.COMPOSIO_API_KEY || '').trim();
  if (!resolvedKey) throw new Error('Missing COMPOSIO_API_KEY');

  const { signal, done } = withTimeout(12000);
  try {
    const res = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts/${encodeURIComponent(connectedAccountId)}`,
      {
        method: 'DELETE',
        headers: { 'x-api-key': resolvedKey, 'accept': 'application/json' },
        signal,
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `Composio HTTP ${res.status}`;
      try { const j = JSON.parse(text); msg = j.error || j.message || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
  } finally {
    done();
  }
}
