-- Extend instances with bot connectivity metadata.
-- These columns make each user's OpenClaw instance discoverable by other
-- platforms that query Supabase directly.

ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS railway_service_id text,
  ADD COLUMN IF NOT EXISTS railway_env_id     text,
  ADD COLUMN IF NOT EXISTS gateway_url        text,
  ADD COLUMN IF NOT EXISTS supabase_url       text,
  ADD COLUMN IF NOT EXISTS bot_connected_at   timestamptz,
  ADD COLUMN IF NOT EXISTS bot_version        text;

-- Optional index for cross-platform discovery by active bot connection.
CREATE INDEX IF NOT EXISTS instances_user_bot_connected_idx
  ON instances (user_id, bot_connected_at DESC);
