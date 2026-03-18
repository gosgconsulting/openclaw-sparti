-- Mission Control tables
-- boards, tasks, approval_requests, audit_events
-- All tables use RLS scoped to auth.uid().

-- ── boards ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boards (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boards: owner read"   ON boards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "boards: owner insert" ON boards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "boards: owner update" ON boards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "boards: owner delete" ON boards FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_boards_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_boards_updated_at();

-- ── tasks ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
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

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: owner read"   ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks: owner insert" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks: owner update" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tasks: owner delete" ON tasks FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_tasks_updated_at();

-- ── approval_requests ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
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

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_requests: owner read"   ON approval_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "approval_requests: owner insert" ON approval_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "approval_requests: owner update" ON approval_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "approval_requests: owner delete" ON approval_requests FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_approval_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER approval_requests_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION update_approval_requests_updated_at();

-- ── audit_events ──────────────────────────────────────────────────────────────
-- Append-only structured audit trail. No update/delete policies by design.

CREATE TABLE IF NOT EXISTS audit_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid        REFERENCES instances(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  actor       text        NOT NULL DEFAULT 'system',
  payload     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-user queries ordered by time
CREATE INDEX IF NOT EXISTS audit_events_user_id_created_at
  ON audit_events (user_id, created_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Read-only for owners. Insert via service role (server-side only).
CREATE POLICY "audit_events: owner read"   ON audit_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "audit_events: owner insert" ON audit_events FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policies: audit log is immutable.
