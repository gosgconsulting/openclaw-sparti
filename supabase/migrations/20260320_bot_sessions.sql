-- bot_sessions
-- Durable per-user, per-instance bot session tracking.
-- Helps correlate cross-platform threads (Telegram/Discord/etc.) with
-- Mission Control audit events and token usage records.

CREATE TABLE IF NOT EXISTS bot_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id        uuid        NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  channel            text        NOT NULL,
  external_thread_id text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  last_active_at     timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_sessions: owner read"
  ON bot_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bot_sessions: owner insert"
  ON bot_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bot_sessions: owner update"
  ON bot_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS bot_sessions_user_started_idx
  ON bot_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS bot_sessions_instance_last_active_idx
  ON bot_sessions (instance_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS bot_sessions_external_thread_idx
  ON bot_sessions (channel, external_thread_id);
