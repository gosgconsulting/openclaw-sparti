-- mc_prompts: saved /shortcode workflows, skills, agent launches, edge fn calls
-- Bridge columns on mc_agents and mc_boards to link to real Sparti data.
-- All tables use RLS scoped to auth.uid().

-- ── mc_prompts ────────────────────────────────────────────────────────────────
-- Stores named shortcodes that the bot can execute with /slug syntax.
-- type: workflow | skill | agent_launch | edge_fn | chat | composite
-- payload: JSON describing what to execute (agent_id, edge_fn slug, steps, etc.)

CREATE TABLE IF NOT EXISTS mc_prompts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text,
  type        text        NOT NULL DEFAULT 'workflow'
              CHECK (type IN ('workflow', 'skill', 'agent_launch', 'edge_fn', 'chat', 'composite')),
  payload     jsonb       NOT NULL DEFAULT '{}',
  is_active   boolean     NOT NULL DEFAULT true,
  usage_count integer     NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

ALTER TABLE mc_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_prompts: owner read"   ON mc_prompts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_prompts: owner insert" ON mc_prompts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_prompts: owner update" ON mc_prompts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mc_prompts: owner delete" ON mc_prompts FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_mc_prompts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER mc_prompts_updated_at
  BEFORE UPDATE ON mc_prompts
  FOR EACH ROW EXECUTE FUNCTION update_mc_prompts_updated_at();

-- Index for fast slug lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS mc_prompts_user_slug ON mc_prompts (user_id, slug);

-- ── Bridge columns on mc_agents ───────────────────────────────────────────────
-- Links a Mission Control agent record to a real Sparti ai_agents or custom_agents row.
-- sparti_agent_source: 'ai_agents' | 'custom_agents' — which table the ID refers to.

ALTER TABLE mc_agents
  ADD COLUMN IF NOT EXISTS sparti_agent_id     uuid,
  ADD COLUMN IF NOT EXISTS sparti_agent_source text
    CHECK (sparti_agent_source IN ('ai_agents', 'custom_agents'));

-- ── Bridge columns on mc_boards ───────────────────────────────────────────────
-- Links a Mission Control board to a Sparti brand or project for context.

ALTER TABLE mc_boards
  ADD COLUMN IF NOT EXISTS sparti_brand_id   uuid,
  ADD COLUMN IF NOT EXISTS sparti_project_id uuid;
