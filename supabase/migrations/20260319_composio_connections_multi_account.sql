-- Allow multiple connected accounts per (user_id, toolkit_key).
-- Drop the previous one-row-per-toolkit unique constraint and add a unique
-- constraint on (user_id, toolkit_key, connected_account_id) so we can have
-- multiple rows per toolkit (one per connected account). NULL connected_account_id
-- is not included in the unique index so "initiated" rows remain flexible.

ALTER TABLE composio_connections
  DROP CONSTRAINT IF EXISTS composio_connections_user_toolkit_unique;

CREATE UNIQUE INDEX IF NOT EXISTS composio_connections_user_toolkit_account_unique
  ON composio_connections (user_id, toolkit_key, connected_account_id)
  WHERE connected_account_id IS NOT NULL;
