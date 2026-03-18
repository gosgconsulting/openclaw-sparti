-- composio_connections
-- Tracks Composio OAuth connection state per user per toolkit.
-- One row per (user_id, toolkit_key). Upserted on connect/reconnect.
--
-- status values:
--   initiated   — link generated, user has not completed OAuth yet
--   active      — OAuth completed, connected_account_id is valid
--   disconnected — user explicitly disconnected
--   expired     — Composio reported the token expired (webhook or poll)

CREATE TABLE IF NOT EXISTS composio_connections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  toolkit_key          text        NOT NULL,
  connection_request_id text,
  connected_account_id text,
  status               text        NOT NULL DEFAULT 'initiated'
                                   CHECK (status IN ('initiated','active','disconnected','expired')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT composio_connections_user_toolkit_unique UNIQUE (user_id, toolkit_key)
);

-- Row-level security: users can only see and modify their own rows.
ALTER TABLE composio_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "composio_connections: owner read"
  ON composio_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "composio_connections: owner insert"
  ON composio_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "composio_connections: owner update"
  ON composio_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "composio_connections: owner delete"
  ON composio_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on every write.
CREATE OR REPLACE FUNCTION update_composio_connections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER composio_connections_updated_at
  BEFORE UPDATE ON composio_connections
  FOR EACH ROW EXECUTE FUNCTION update_composio_connections_updated_at();
