function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

function toSafeString(v) {
  if (v == null) return '';
  return String(v);
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

