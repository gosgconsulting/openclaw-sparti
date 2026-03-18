function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toJsonForScript(value) {
  return JSON.stringify(value ?? null).replaceAll('</', '<\\/');
}

function renderChannelCard(ch, currentCfg) {
  const safeName = escapeHtml(ch.displayName || ch.name);
  const desc = ch.description ? `<div class="muted" style="margin-top:2px;">${escapeHtml(ch.description)}</div>` : '';
  const icon = ch.icon?.svg
    ? `<span class="icon" style="color:${escapeHtml(ch.icon.color || '#6B7280')}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ch.icon.svg}"/></svg></span>`
    : `<span class="icon"><span class="emoji">${escapeHtml(ch.emoji || '💬')}</span></span>`;

  const enabled = !!currentCfg?.enabled;
  const hasConfig = !!currentCfg;
  const statusLabel = enabled ? `<span class="badge on">Enabled</span>` : (hasConfig ? `<span class="badge">Configured</span>` : `<span class="badge off">Not set</span>`);

  const fields = (ch.fields || []).map(f => {
    const id = `${ch.name}-${f.id}`;
    const val = currentCfg && currentCfg[f.id] != null ? String(currentCfg[f.id]) : '';
    const type = f.type === 'password' ? 'password' : 'text';
    return `
      <div class="field">
        <label for="${escapeHtml(id)}">${escapeHtml(f.label || f.id)}</label>
        <input id="${escapeHtml(id)}" name="${escapeHtml(f.id)}" type="${escapeHtml(type)}" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(val)}" />
      </div>
    `;
  }).join('');

  const help = ch.helpUrl
    ? `<div class="help"><a href="${escapeHtml(ch.helpUrl)}" target="_blank" rel="noreferrer">Docs</a>${ch.note ? ` · <span>${escapeHtml(ch.note)}</span>` : ''}</div>`
    : (ch.note ? `<div class="help">${escapeHtml(ch.note)}</div>` : '');

  return `
    <div class="channel-card">
      <div class="channel-head">
        <div class="channel-title">
          ${icon}
          <div>
            <div class="name">${safeName}</div>
            ${desc}
          </div>
        </div>
        <div class="channel-meta">
          ${statusLabel}
        </div>
      </div>
      <form class="channel-form" method="POST" action="/dashboard/channels/${encodeURIComponent(ch.name)}">
        <div class="row">
          <label class="toggle">
            <input type="checkbox" name="enabled" value="true" ${enabled ? 'checked' : ''}/>
            <span>Enabled</span>
          </label>
        </div>
        ${fields ? `<div class="fields">${fields}</div>` : ''}
        ${help}
        <div class="row">
          <button class="btn primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  `;
}

export function getDashboardPageHTML({ userEmail, instance, error, channelGroups, channelsConfig } = {}) {
  const errHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const groups = Array.isArray(channelGroups) ? channelGroups : [];
  const cfg = channelsConfig && typeof channelsConfig === 'object' ? channelsConfig : {};

  const popular = groups.filter(c => c.category === 'popular');
  const more = groups.filter(c => c.category !== 'popular');

  const channelsHtml = `
    ${popular.length ? `<h2 class="section-title">Channels</h2>` : ''}
    <div class="channel-grid">
      ${popular.map(ch => renderChannelCard(ch, cfg[ch.name])).join('')}
    </div>
    ${more.length ? `<h2 class="section-title" style="margin-top:18px;">More</h2>` : ''}
    <div class="channel-grid">
      ${more.map(ch => renderChannelCard(ch, cfg[ch.name])).join('')}
    </div>
  `;

  const publishBtn = instance?.id
    ? `<form method="POST" action="/api/instances/${encodeURIComponent(instance.id)}/publish" onsubmit="return confirm('Publish and generate a public URL?');" style="margin:0;">
        <button class="btn small" type="submit">Publish public URL</button>
      </form>`
    : '';
  const publicUrl = instance?.public_url
    ? `<a class="btn small" href="${escapeHtml(instance.public_url)}" target="_blank" rel="noreferrer">Open public URL</a>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OpenClaw - Dashboard</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"/>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #0f1117;
      color: #e4e4e7;
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: -0.02em;
    }
    header {
      padding: 18px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(15,17,23,0.9);
      position: sticky;
      top: 0;
      backdrop-filter: blur(8px);
    }
    .wrap { width: min(1100px, calc(100vw - 32px)); margin: 0 auto; }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    h1 { margin: 0; font-size: 18px; font-weight: 800; color: #fafafa; }
    .meta { color: #a1a1aa; font-size: 13px; }
    .logout {
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(24,27,34,0.9);
      color: #e4e4e7;
      border-radius: 10px;
      padding: 10px 12px;
      cursor: pointer;
      font-weight: 700;
    }
    main { padding: 20px 0 60px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
    .card {
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(24,27,34,0.85);
      border-radius: 14px;
      padding: 16px;
    }
    .error {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,92,92,0.35);
      background: rgba(153,27,27,0.2);
      color: #ff8a8a;
      font-size: 14px;
      margin-bottom: 12px;
    }
    form { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
    label { display: block; font-size: 13px; color: #cbd5e1; margin: 0 0 6px; }
    input {
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.9);
      color: #e4e4e7;
      outline: none;
      font-size: 15px;
      min-width: 260px;
    }
    input:focus {
      border-color: rgba(0,229,204,0.7);
      box-shadow: 0 0 0 4px rgba(0,229,204,0.12);
    }
    button.primary {
      padding: 12px 14px;
      border-radius: 10px;
      border: 0;
      background: linear-gradient(135deg, #00e5cc, #0ea5e9);
      color: #051018;
      font-weight: 900;
      cursor: pointer;
    }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.35);
      color: #e4e4e7;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
    }
    .btn:hover { text-decoration: none; border-color: rgba(0,229,204,0.35); }
    .btn.small { padding: 8px 10px; font-size: 12px; border-radius: 999px; }
    .btn.primary {
      border: 0;
      background: linear-gradient(135deg, #00e5cc, #0ea5e9);
      color: #051018;
    }
    .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #cbd5e1; }
    .muted { color: #a1a1aa; }
    .empty { color: #a1a1aa; font-size: 14px; padding: 10px 0 0; }
    a { color: #00e5cc; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .tabs {
      display: inline-flex;
      gap: 8px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(15,17,23,0.35);
      padding: 6px;
      border-radius: 999px;
    }
    .tab {
      border: 0;
      border-radius: 999px;
      padding: 10px 12px;
      font-weight: 900;
      background: transparent;
      color: #a1a1aa;
      cursor: pointer;
    }
    .tab.active {
      background: rgba(255,255,255,0.10);
      color: #fafafa;
    }
    .panel { display: none; }
    .panel.active { display: block; }

    .section-title { margin: 0 0 10px 0; font-size: 16px; font-weight: 900; color:#fafafa; }
    .channel-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 920px) {
      .channel-grid { grid-template-columns: 1fr 1fr; }
    }
    .channel-card {
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(24,27,34,0.75);
      border-radius: 14px;
      padding: 14px;
    }
    .channel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .channel-title { display:flex; align-items:flex-start; gap: 10px; }
    .icon { width: 22px; height: 22px; display:inline-grid; place-items:center; margin-top: 2px; }
    .icon svg { width: 20px; height: 20px; }
    .emoji { font-size: 20px; line-height: 1; }
    .name { font-weight: 900; color: #fafafa; }
    .channel-meta { display:flex; gap:8px; align-items:center; }
    .badge {
      display:inline-flex;
      align-items:center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.55);
      font-size: 12px;
      color: #a1a1aa;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge.on { border-color: rgba(0,229,204,0.35); color: #00e5cc; }
    .badge.off { color: #a1a1aa; }
    .channel-form { margin-top: 10px; display: grid; gap: 10px; }
    .row { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
    .toggle { display:flex; align-items:center; gap: 10px; color: #e4e4e7; font-weight: 800; }
    .toggle input { min-width: auto; }
    .fields { display:grid; grid-template-columns: 1fr; gap: 10px; }
    @media (min-width: 920px) { .fields { grid-template-columns: 1fr 1fr; } }
    .field input { min-width: 0; width: 100%; }
    .help { font-size: 12px; color: #71717a; }
    .help a { color: #00e5cc; }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <div>
        <h1>Dashboard</h1>
        <div class="meta">${userEmail ? `Signed in as <span class="mono">${escapeHtml(userEmail)}</span>` : ''}</div>
      </div>
      <form method="POST" action="/auth/logout">
        <button class="logout" type="submit">Log out</button>
      </form>
    </div>
  </header>
  <main>
    <div class="wrap grid">
      <div class="card">
        ${errHtml}
        <div class="row" style="justify-content: space-between;">
          <div class="tabs" role="tablist" aria-label="Dashboard tabs">
            <button class="tab active" data-tab="channels" type="button">Channels</button>
            <button class="tab" data-tab="connectors" type="button">Connectors</button>
          </div>
          <div class="actions">
            ${publicUrl}
            ${publishBtn}
            <a class="btn small" href="/openclaw" target="_blank" rel="noreferrer">Open console</a>
            <a class="btn small" href="/lite" target="_blank" rel="noreferrer">Admin</a>
          </div>
        </div>
      </div>

      <div class="card panel active" id="panel-channels">
        ${channelsHtml}
      </div>

      <div class="card panel" id="panel-connectors">
        <h2 class="section-title">Connectors</h2>
        <div class="muted" style="margin-bottom:10px;">Powered by Composio. Connections are configured server-side.</div>
        <div id="connectors-error" class="error" style="display:none;"></div>
        <div id="connectors-loading" class="muted">Loading…</div>
        <div id="connectors-list" class="channel-grid"></div>
      </div>
    </div>
  </main>
  <script>
    const CHANNEL_GROUPS = ${toJsonForScript(groups)};

    function setTab(tab) {
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      document.getElementById('panel-channels').classList.toggle('active', tab === 'channels');
      document.getElementById('panel-connectors').classList.toggle('active', tab === 'connectors');
      if (tab === 'connectors') loadConnectors();
      history.replaceState(null, '', '#tab=' + tab);
    }

    async function loadConnectors() {
      const loading = document.getElementById('connectors-loading');
      const list = document.getElementById('connectors-list');
      const err = document.getElementById('connectors-error');
      if (list.dataset.loaded === '1') {
        loading.style.display = 'none';
        return;
      }
      err.style.display = 'none';
      loading.style.display = 'block';
      list.innerHTML = '';

      try {
        const res = await fetch('/dashboard/connectors', { headers: { 'Accept': 'application/json' } });
        const json = await res.json();
        if (!res.ok) throw new Error(json && json.error ? json.error : ('HTTP ' + res.status));
        const items = Array.isArray(json.connectors) ? json.connectors : [];
        const configured = json && json.configured === true;

        function badgeHtml(label, cls) {
          return '<span class="badge' + (cls ? ' ' + cls : '') + '">' + escapeHtml(label) + '</span>';
        }

        function connectorEmoji(key, provider) {
          const k = String(key || '').toLowerCase();
          if (k.includes('google')) return '🟦';
          if (k.includes('github')) return '🐙';
          if (k.includes('slack')) return '💬';
          if (k.includes('web')) return '🔎';
          if (provider === 'builtin') return '🧩';
          return '🔌';
        }

        function renderConnector(c) {
          const key = c && (c.key || c.id || c.name) ? String(c.key || c.id || c.name) : 'connector';
          const name = c && (c.name || c.displayName || c.key) ? String(c.name || c.displayName || c.key) : 'Connector';
          const desc = c && c.description ? String(c.description) : '';
          const provider = c && c.provider ? String(c.provider) : 'composio';
          const badges = (c && c.badges && typeof c.badges === 'object') ? c.badges : {};
          const accounts = Array.isArray(c?.accounts) ? c.accounts : [];

          const badgeBits = [];
          if (provider === 'builtin') badgeBits.push(badgeHtml('Built-in', 'on'));
          if (badges && badges.recommended) badgeBits.push(badgeHtml('Recommended', 'on'));
          if (badges && badges.active) badgeBits.push(badgeHtml('Active', 'on'));
          if (badges && badges.connected) badgeBits.push(badgeHtml('Connected', 'on'));
          if (!badges?.connected && provider !== 'builtin') badgeBits.push(badgeHtml('Not connected', 'off'));

          const accountLines = accounts.length
            ? accounts.map(a => {
                const label = (a && (a.email || a.label || a.id)) ? String(a.email || a.label || a.id) : 'Account';
                return '<div class="row" style="justify-content: space-between; gap:12px; margin-top:8px;">' +
                  '<div class="mono" style="opacity:0.95;">' + escapeHtml(label) + '</div>' +
                  '<div class="actions" style="gap:10px;">' +
                    '<button class="btn small" type="button" data-action="reconnect" data-key="' + escapeHtml(key) + '">Reconnect</button>' +
                    '<button class="btn small" type="button" data-action="disconnect" data-key="' + escapeHtml(key) + '" style="border-color: rgba(255,92,92,0.35);">Disconnect</button>' +
                  '</div>' +
                '</div>';
              }).join('')
            : '<div class="muted" style="margin-top:8px;">No accounts connected.</div>';

          const canAddAccount = provider !== 'builtin';
          const addAccountBtn = canAddAccount
            ? '<button class="btn small" type="button" data-action="connect" data-key="' + escapeHtml(key) + '">Add account</button>'
            : '';

          const warning = (!configured && provider === 'composio')
            ? '<div class="help" style="margin-top:10px;">Set <span class="mono">COMPOSIO_API_KEY</span> on the server to enable Composio connectors.</div>'
            : '';

          return '' +
            '<div class="channel-card">' +
              '<div class="channel-head">' +
                '<div class="channel-title">' +
                  '<span class="icon"><span class="emoji">' + escapeHtml(connectorEmoji(key, provider)) + '</span></span>' +
                  '<div>' +
                    '<div class="name">' + escapeHtml(name) + '</div>' +
                    (desc ? '<div class="muted" style="margin-top:2px;">' + escapeHtml(desc) + '</div>' : '') +
                  '</div>' +
                '</div>' +
                '<div class="channel-meta">' + badgeBits.join('') + '</div>' +
              '</div>' +
              '<div style="margin-top:10px;">' +
                '<div class="row" style="justify-content: space-between;">' +
                  '<div class="muted">Accounts</div>' +
                  '<div class="actions">' + addAccountBtn + '</div>' +
                '</div>' +
                accountLines +
                warning +
              '</div>' +
            '</div>';
        }

        if (items.length === 0) {
          list.innerHTML = '<div class="muted">No connectors available.</div>';
        } else {
          list.innerHTML = items.map(renderConnector).join('');
        }
        list.dataset.loaded = '1';
      } catch (e) {
        err.textContent = (e && e.message) ? e.message : 'Failed to load connectors';
        err.style.display = 'block';
      } finally {
        loading.style.display = 'none';
      }
    }

    async function runConnectorAction(action, key) {
      const err = document.getElementById('connectors-error');
      err.style.display = 'none';
      try {
        const res = await fetch('/dashboard/connectors/' + encodeURIComponent(key) + '/' + encodeURIComponent(action), {
          method: 'POST',
          headers: { 'Accept': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json && json.error ? json.error : ('HTTP ' + res.status));
        // For now, actions are stubs; keep UX explicit.
        alert('Done.');
      } catch (e) {
        err.textContent = (e && e.message) ? e.message : 'Action failed';
        err.style.display = 'block';
      }
    }

    function escapeHtml(s) {
      return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
    document.getElementById('panel-connectors').addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('button[data-action][data-key]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const key = btn.getAttribute('data-key');
      if (!action || !key) return;
      runConnectorAction(action, key);
    });
    const m = location.hash.match(/tab=([a-z]+)/);
    if (m && (m[1] === 'connectors' || m[1] === 'channels')) setTab(m[1]);
  </script>
</body>
</html>`;
}

