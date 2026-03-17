function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getInstanceConsolePageHTML({ instance, consoleUrl, adminUrl, error } = {}) {
  const title = instance?.name ? `Console · ${instance.name}` : 'Instance Console';
  const errHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"/>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(1200px 800px at 30% 20%, rgba(0,229,204,0.14), transparent 55%),
                  radial-gradient(900px 600px at 70% 80%, rgba(255,92,92,0.16), transparent 55%),
                  #0f1117;
      color: #e4e4e7;
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: -0.02em;
    }
    .card {
      width: min(720px, calc(100vw - 32px));
      background: rgba(24,27,34,0.9);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; color: #fafafa; }
    p { margin: 0 0 16px 0; color: #a1a1aa; }
    .error {
      margin: 0 0 14px 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,92,92,0.35);
      background: rgba(153,27,27,0.2);
      color: #ff8a8a;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-top: 14px;
    }
    .row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(15,17,23,0.55);
    }
    .k { color: #a1a1aa; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .v { color: #e4e4e7; font-size: 14px; overflow-wrap: anywhere; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #cbd5e1; }
    .actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.35);
      color: #e4e4e7;
      font-weight: 800;
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    a.btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      border-color: rgba(0,229,204,0.35);
    }
    a.btn.primary {
      background: linear-gradient(135deg, #00e5cc, #0ea5e9);
      color: #051018;
      border: 0;
    }
    .note {
      margin-top: 12px;
      font-size: 12px;
      color: #71717a;
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(instance?.name || 'Instance Console')}</h1>
    <p>Token-gated console link for this instance.</p>
    ${errHtml}

    <div class="grid">
      <div class="row">
        <div class="k">Instance ID</div>
        <div class="v mono">${escapeHtml(instance?.id || '-')}</div>
      </div>
      <div class="row">
        <div class="k">Status</div>
        <div class="v">${escapeHtml(instance?.status || '-')}</div>
      </div>
      <div class="row">
        <div class="k">Public URL</div>
        <div class="v">${instance?.public_url ? `<a href="${escapeHtml(instance.public_url)}" target="_blank" rel="noreferrer">${escapeHtml(instance.public_url)}</a>` : '-'}</div>
      </div>
      <div class="row">
        <div class="k">Console URL</div>
        <div class="v">${consoleUrl ? `<a href="${escapeHtml(consoleUrl)}" target="_blank" rel="noreferrer">${escapeHtml(consoleUrl)}</a>` : '-'}</div>
      </div>
    </div>

    <div class="actions">
      ${instance?.public_url ? `<a class="btn primary" href="${escapeHtml(instance.public_url)}" target="_blank" rel="noreferrer">Open public URL</a>` : ''}
      ${adminUrl ? `<a class="btn" href="${escapeHtml(adminUrl)}" target="_blank" rel="noreferrer">Open admin console</a>` : ''}
    </div>

    <div class="note">Admin console requires your setup password. Public URL access requires the instance token.</div>
  </main>
</body>
</html>`;
}

