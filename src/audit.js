/**
 * Audit event emitter
 *
 * Non-blocking helper to persist structured audit events to Supabase.
 * Errors are logged but never thrown — audit failures must not break the
 * primary action that triggered them.
 */

/**
 * Emit a structured audit event.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ userId: string, instanceId?: string|null, eventType: string, actor?: string, payload?: object }} opts
 */
export async function emitAudit(supabase, { userId, instanceId = null, eventType, actor = 'system', payload = {} }) {
  if (!supabase || !userId || !eventType) return;
  try {
    await supabase.from('mc_audit_events').insert({
      user_id: userId,
      instance_id: instanceId || null,
      event_type: eventType,
      actor,
      payload,
    });
  } catch (err) {
    console.error('[audit] emitAudit failed:', err?.message || err);
  }
}
