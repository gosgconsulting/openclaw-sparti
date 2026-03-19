-- app_settings
-- Global key/value settings used by server-side bootstrap logic.
-- Examples:
--   key='llm_gateway' value={ base_url, api_key, model_id, provider_id?, context_window?, max_tokens? }
--   key='composio'    value={ api_key }
--
-- Security model:
-- - RLS enabled
-- - no policies for anon/authenticated users
-- - reads/writes are done by service-role on the server

CREATE TABLE IF NOT EXISTS app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_app_settings_updated_at();
