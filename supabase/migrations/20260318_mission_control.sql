-- Mission Control tables
-- mc_boards, mc_tasks, mc_approval_requests, mc_audit_events
-- Prefixed with mc_ to avoid collision with existing public.tasks table.
-- All tables use RLS scoped to auth.uid().

-- ── mc_boards ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_boards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_boards: owner read"   ON mc_boards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_boards: owner insert" ON mc_boards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_boards: owner update" ON mc_boards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mc_boards: owner delete" ON mc_boards FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_mc_boards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER mc_boards_updated_at
  BEFORE UPDATE ON mc_boards
  FOR EACH ROW EXECUTE FUNCTION update_mc_boards_updated_at();

-- ── mc_tasks ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid        NOT NULL REFERENCES mc_boards(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text,
  status          text        NOT NULL DEFAULT 'todo'
                              CHECK (status IN ('todo', 'in-progress', 'done')),
  assignee_agent  text,
  tags            text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_tasks: owner read"   ON mc_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_tasks: owner insert" ON mc_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_tasks: owner update" ON mc_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mc_tasks: owner delete" ON mc_tasks FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_mc_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER mc_tasks_updated_at
  BEFORE UPDATE ON mc_tasks
  FOR EACH ROW EXECUTE FUNCTION update_mc_tasks_updated_at();

-- ── mc_approval_requests ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mc_approval_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at  timestamptz,
  decided_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mc_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mc_approval_requests: owner read"   ON mc_approval_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_approval_requests: owner insert" ON mc_approval_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mc_approval_requests: owner update" ON mc_approval_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "mc_approval_requests: owner delete" ON mc_approval_requests FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_mc_approval_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER mc_approval_requests_updated_at
  BEFORE UPDATE ON mc_approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_mc_approval_requests_updated_at();

-- ── mc_audit_events ───────────────────────────────────────────────────────────
-- Append-only structured audit trail. No update/delete policies by design.

CREATE TABLE IF NOT EXISTS mc_audit_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid        REFERENCES instances(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  actor       text        NOT NULL DEFAULT 'system',
  payload     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-user queries ordered by time
CREATE INDEX IF NOT EXISTS mc_audit_events_user_id_created_at
  ON mc_audit_events (user_id, created_at DESC);

ALTER TABLE mc_audit_events ENABLE ROW LEVEL SECURITY;

-- Read-only for owners. Insert via service role (server-side only).
CREATE POLICY "mc_audit_events: owner read"   ON mc_audit_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "mc_audit_events: owner insert" ON mc_audit_events FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policies: audit log is immutable.
