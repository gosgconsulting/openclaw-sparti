-- instance_token_usage
-- Persistent per-instance token/cost records so Mission Control and external
-- platforms can query bot usage directly from Supabase.

CREATE TABLE IF NOT EXISTS instance_token_usage (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id        uuid           NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  session_id         uuid           REFERENCES bot_sessions(id) ON DELETE SET NULL,
  model              text           NOT NULL,
  prompt_tokens      integer        NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens  integer        NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens       integer        NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  source             text,
  created_at         timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE instance_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instance_token_usage: owner read"
  ON instance_token_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS instance_token_usage_user_created_idx
  ON instance_token_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS instance_token_usage_instance_created_idx
  ON instance_token_usage (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS instance_token_usage_session_idx
  ON instance_token_usage (session_id);
