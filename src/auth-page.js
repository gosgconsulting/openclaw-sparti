import { getDarkThemeBlock } from './design-tokens.js';

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
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OpenClaw - Sign in</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"/>
  <style>
    ${getDarkThemeBlock({ focusVisible: true })}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: radial-gradient(1200px 800px at 30% 20%, rgba(255,92,92,0.18), transparent 55%),
                  radial-gradient(900px 600px at 70% 80%, rgba(0,229,204,0.12), transparent 55%),
                  var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      letter-spacing: -0.02em;
    }
    .card {
      width: min(420px, calc(100vw - 32px));
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 28px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
    }
    h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: var(--text-strong); }
    p { margin: 0 0 18px 0; color: var(--muted); }
    .error {
      margin: 0 0 14px 0;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(255,92,92,0.35);
      background: rgba(153,27,27,0.2);
      color: #ff8a8a;
      font-size: 14px;
    }
    label { display: block; font-size: 13px; color: var(--text); margin: 10px 0 6px; }
    input {
      width: 100%;
      padding: 12px 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      color: var(--text);
      outline: none;
      font-size: 15px;
    }
    input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-subtle);
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
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 18px 0 10px;
      color: #71717a;
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    .divider::before, .divider::after {
      content: '';
      height: 1px;
      flex: 1;
      background: rgba(255,255,255,0.10);
    }
    .oauthBtn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(15,17,23,0.35);
      color: #e4e4e7;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .oauthBtn:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      border-color: rgba(0,229,204,0.35);
    }
    .oauthBtn svg { width: 18px; height: 18px; }
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
    ${isSignup ? '' : `
      <div class="divider">OR CONTINUE WITH</div>
      <button class="oauthBtn" id="googleBtn" type="button" aria-label="Continue with Google">
        <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.687 32.657 29.229 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917Z"/>
          <path fill="#FF3D00" d="M6.306 14.691 12.88 19.51C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.338 6.306 14.691Z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.196l-6.19-5.238C29.203 35.091 26.715 36 24 36c-5.207 0-9.652-3.318-11.281-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44Z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.781 2.153-2.367 3.977-4.484 5.238h.003l6.19 5.238C36.573 39.14 44 34 44 24c0-1.341-.138-2.651-.389-3.917Z"/>
        </svg>
        Continue with Google
      </button>
    `}
    <div class="alt">
      ${isSignup
        ? `Already have an account? <a href="/auth?redirect=${encodeURIComponent(redirectValue)}">Sign in</a>`
        : `New here? <a href="/auth?mode=signup&redirect=${encodeURIComponent(redirectValue)}">Create an account</a>`}
    </div>
    <div class="note">Uses Supabase Auth.</div>
  </main>
  <script>
    (function() {
      var hash = location.hash;
      if (!hash) return;
      document.querySelectorAll('input[name="redirect"]').forEach(function(el) {
        if (el.value && el.value.indexOf('#') === -1 && el.value.charAt(0) === '/') el.value += hash;
      });
    })();
  </script>
  <script type="module">
    const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(supabaseAnonKey)};
    const REDIRECT_TO = ${JSON.stringify(redirectValue)};

    function getRedirectWithHash() {
      var el = document.querySelector('input[name="redirect"]');
      return (el && el.value) ? el.value : REDIRECT_TO;
    }

    const googleBtn = document.getElementById('googleBtn');
    const canOAuth = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
    if (googleBtn && !canOAuth) {
      googleBtn.disabled = true;
      googleBtn.title = 'Supabase env vars missing (SUPABASE_URL / SUPABASE_ANON_KEY).';
      googleBtn.style.opacity = '0.6';
      googleBtn.style.cursor = 'not-allowed';
    }

    let supabase = null;
    async function getClient() {
      if (supabase) return supabase;
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true }
      });
      return supabase;
    }

    async function maybeFinalizeOAuthSession() {
      if (!canOAuth) return;
      const client = await getClient();
      const { data } = await client.auth.getSession();
      const session = data && data.session ? data.session : null;
      if (!session || !session.access_token || !session.refresh_token) return;

      const redirectTo = getRedirectWithHash();
      const res = await fetch('/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at || null,
          redirect: redirectTo
        })
      });
      if (res.redirected) {
        window.location.href = res.url;
      } else if (res.ok) {
        window.location.href = redirectTo || '/dashboard';
      }
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        if (!canOAuth) return;
        const client = await getClient();
        const redirectTo = getRedirectWithHash();
        await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + '/auth?redirect=' + encodeURIComponent(redirectTo || '/dashboard') }
        });
      });
    }

    maybeFinalizeOAuthSession();
  </script>
</body>
</html>`;
}

