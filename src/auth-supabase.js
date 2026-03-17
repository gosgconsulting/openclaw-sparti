import { createSupabaseClient } from './supabase.js';

const ACCESS_COOKIE = 'sb_access_token';
const REFRESH_COOKIE = 'sb_refresh_token';

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function getSupabaseTokensFromRequest(req) {
  const accessToken = req.cookies?.[ACCESS_COOKIE] || null;
  const refreshToken = req.cookies?.[REFRESH_COOKIE] || null;
  return { accessToken, refreshToken };
}

export function setSupabaseAuthCookies(res, session) {
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error('Missing Supabase session tokens');
  }

  const opts = getCookieOptions();
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  const maxAgeMs = expiresAtMs ? Math.max(0, expiresAtMs - Date.now()) : undefined;

  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...opts,
    maxAge: maxAgeMs ?? 60 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...opts,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSupabaseAuthCookies(res) {
  const opts = getCookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}

export function requireUser() {
  return async (req, res, next) => {
    try {
      const { accessToken, refreshToken } = getSupabaseTokensFromRequest(req);
      const redirectTo = encodeURIComponent(req.originalUrl || '/dashboard');

      if (!accessToken && !refreshToken) {
        return res.redirect(`/auth?redirect=${redirectTo}`);
      }

      // Validate with current access token if possible
      if (accessToken) {
        const supabase = createSupabaseClient({ accessToken });
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) {
          req.user = { id: data.user.id, email: data.user.email };
          req.supabaseAccessToken = accessToken;
          return next();
        }
      }

      // Attempt refresh if we have refresh token
      if (refreshToken) {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!error && data?.session?.access_token) {
          setSupabaseAuthCookies(res, data.session);

          const supabaseWithAccess = createSupabaseClient({ accessToken: data.session.access_token });
          const u = await supabaseWithAccess.auth.getUser();
          if (!u.error && u.data?.user) {
            req.user = { id: u.data.user.id, email: u.data.user.email };
            req.supabaseAccessToken = data.session.access_token;
            return next();
          }
        }
      }

      clearSupabaseAuthCookies(res);
      return res.redirect(`/auth?redirect=${redirectTo}`);
    } catch (err) {
      return next(err);
    }
  };
}

