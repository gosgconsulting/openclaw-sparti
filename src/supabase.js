import { createClient } from '@supabase/supabase-js';

const AUTH_OPTIONS = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

/**
 * Returns a RLS-scoped Supabase client for the given access token.
 * Returns null if SUPABASE_URL or SUPABASE_ANON_KEY are not set so callers
 * can handle missing config gracefully rather than crashing mid-request.
 *
 * @param {{ accessToken?: string }} [opts]
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function createSupabaseClient({ accessToken } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: AUTH_OPTIONS,
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

/**
 * Server-side admin client for reading/writing protected data (bypasses RLS).
 * Returns null if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: AUTH_OPTIONS,
  });
}

