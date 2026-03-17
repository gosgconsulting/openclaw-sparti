function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getTokenFromPublicUrl(publicUrl) {
  if (!publicUrl) return null;
  try {
    const u = new URL(publicUrl);
    return u.searchParams.get('token');
  } catch {
    return null;
  }
}

export function getDashboardPageHTML({ userEmail, instances, error } = {}) {
  const errHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const rows = (instances || [])
    .map(i => {
      const token = getTokenFromPublicUrl(i.public_url);
      const consoleUrl = token ? `/console/${encodeURIComponent(i.id)}?token=${encodeURIComponent(token)}` : null;
      const publishForm = `<form method="POST" action="/api/instances/${encodeURIComponent(i.id)}/publish" onsubmit="return confirm('Publish this instance and generate a public URL?');" style="margin:0;">
        <button class="btn small primary" type="submit">Publish</button>
      </form>`;
      const actions = (i.status !== 'published' || !i.public_url)
        ? publishForm
        : `<div class="actions">
            <a class="btn small" href="${escapeHtml(i.public_url)}" target="_blank" rel="noreferrer">Open URL</a>
            ${consoleUrl ? `<a class="btn small" href="${escapeHtml(consoleUrl)}" target="_blank" rel="noreferrer">Open Console</a>` : ''}
          </div>`;
      return `<tr>
        <td class="mono">${escapeHtml(i.id)}</td>
        <td>${escapeHtml(i.name)}</td>
        <td><span class="pill">${escapeHtml(i.status)}</span></td>
        <td class="muted">${i.public_url ? `<a href="${escapeHtml(i.public_url)}" target="_blank" rel="noreferrer">${escapeHtml(i.public_url)}</a>` : '-'}</td>
        <td class="muted">${escapeHtml(formatDate(i.created_at))}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');

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
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); vertical-align: top; }
    th { text-align: left; font-size: 12px; color: #a1a1aa; font-weight: 700; }
    td { font-size: 14px; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #cbd5e1; }
    .muted { color: #a1a1aa; }
    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.6);
      font-size: 12px;
      color: #e4e4e7;
      font-weight: 700;
    }
    .empty { color: #a1a1aa; font-size: 14px; padding: 10px 0 0; }
    a { color: #00e5cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
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
        <h2 style="margin:0 0 10px 0; font-size: 16px; font-weight: 900; color:#fafafa;">Create instance</h2>
        ${errHtml}
        <form method="POST" action="/api/instances">
          <div>
            <label for="name">Instance name</label>
            <input id="name" name="name" placeholder="e.g. Team A" maxlength="80" required/>
          </div>
          <button class="primary" type="submit">Create</button>
        </form>
        <div class="empty">Instances are DB records for now (no Railway provisioning yet).</div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 10px 0; font-size: 16px; font-weight: 900; color:#fafafa;">Your instances</h2>
        ${instances && instances.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>URL</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        ` : `<div class="empty">No instances yet. Create one above.</div>`}
      </div>
    </div>
  </main>
</body>
</html>`;
}

