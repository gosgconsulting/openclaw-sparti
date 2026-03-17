function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function getAuthPageHTML({ redirect, error, mode } = {}) {
  const redirectValue = redirect || '/dashboard';
  const errorHTML = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const isSignup = mode === 'signup';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OpenClaw - Sign in</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"/>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(1200px 800px at 30% 20%, rgba(255,92,92,0.18), transparent 55%),
                  radial-gradient(900px 600px at 70% 80%, rgba(0,229,204,0.12), transparent 55%),
                  #0f1117;
      color: #e4e4e7;
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      letter-spacing: -0.02em;
    }
    .card {
      width: min(420px, calc(100vw - 32px));
      background: rgba(24,27,34,0.9);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
    }
    h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: #fafafa; }
    p { margin: 0 0 18px 0; color: #a1a1aa; }
    .error {
      margin: 0 0 14px 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,92,92,0.35);
      background: rgba(153,27,27,0.2);
      color: #ff8a8a;
      font-size: 14px;
    }
    label { display: block; font-size: 13px; color: #cbd5e1; margin: 10px 0 6px; }
    input {
      width: 100%;
      padding: 12px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,17,23,0.9);
      color: #e4e4e7;
      outline: none;
      font-size: 15px;
    }
    input:focus {
      border-color: rgba(255,92,92,0.7);
      box-shadow: 0 0 0 4px rgba(255,92,92,0.12);
    }
    .row { display: flex; gap: 10px; margin-top: 14px; }
    button {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: 0;
      background: linear-gradient(135deg, #ff5c5c, #991b1b);
      color: white;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(255,92,92,0.18); }
    .alt {
      margin-top: 12px;
      font-size: 13px;
      color: #a1a1aa;
    }
    .alt a { color: #00e5cc; text-decoration: none; }
    .alt a:hover { text-decoration: underline; }
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
    <h1>${isSignup ? 'Create your account' : 'Sign in'}</h1>
    <p>${isSignup ? 'Create an account to access your dashboard.' : 'Sign in to access your dashboard.'}</p>
    ${errorHTML}
    <form method="POST" action="${isSignup ? '/auth/signup' : '/auth/login'}">
      <input type="hidden" name="redirect" value="${escapeHtml(redirectValue)}"/>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required/>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required/>
      <div class="row">
        <button type="submit">${isSignup ? 'Create account' : 'Sign in'}</button>
      </div>
    </form>
    <div class="alt">
      ${isSignup
        ? `Already have an account? <a href="/auth?redirect=${encodeURIComponent(redirectValue)}">Sign in</a>`
        : `New here? <a href="/auth?mode=signup&redirect=${encodeURIComponent(redirectValue)}">Create an account</a>`}
    </div>
    <div class="note">Uses Supabase Auth (email/password).</div>
  </main>
</body>
</html>`;
}

