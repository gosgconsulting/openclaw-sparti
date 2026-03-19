-- Unify mc_boards into the Sparti `projects` table.
--
-- mc_boards was a Mission Control-specific duplicate of `projects`:
--   mc_boards.name         → projects.title
--   mc_boards.sparti_brand_id → projects.brand_id
--   mc_boards.status       → projects.status / is_active
--   mc_boards.sparti_project_id → was the bridge FK to projects (now primary)
--
-- After this migration:
--   • mc_tasks.project_id references projects(id) ON DELETE CASCADE
--   • mc_tasks.board_id becomes vestigial (nullable, FK dropped)
--   • mc_boards table is dropped
--
-- The Mission Control "Tasks" panel reads projects as boards.
-- All existing mc_tasks data is preserved and re-mapped to projects rows.

BEGIN;

-- ── Step 1: Add project_id column to mc_tasks ─────────────────────────────────

ALTER TABLE mc_tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- ── Step 2: Populate project_id for tasks whose board had a sparti_project_id ─

UPDATE mc_tasks t
SET    project_id = b.sparti_project_id
FROM   mc_boards b
WHERE  t.board_id = b.id
  AND  b.sparti_project_id IS NOT NULL
  AND  t.project_id IS NULL;

-- ── Step 3: For boards without a linked project, create a project and map it ──

DO $$
DECLARE
  rec            RECORD;
  new_project_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT
           b.id          AS board_id,
           b.user_id,
           b.name,
           b.description,
           b.sparti_brand_id,
           b.status,
           b.created_at,
           b.updated_at
    FROM   mc_boards b
    WHERE  b.sparti_project_id IS NULL
      AND  EXISTS (
             SELECT 1 FROM mc_tasks t
             WHERE  t.board_id = b.id
               AND  t.project_id IS NULL
           )
  LOOP
    -- Create a project that mirrors the board
    INSERT INTO projects (
      user_id, title, description, brand_id,
      status, is_active,
      created_at, updated_at
    )
    VALUES (
      rec.user_id,
      rec.name,
      rec.description,
      rec.sparti_brand_id,
      CASE WHEN rec.status = 'active' THEN 'active' ELSE 'archived' END,
      rec.status = 'active',
      rec.created_at,
      rec.updated_at
    )
    RETURNING id INTO new_project_id;

    -- Map all tasks of this board to the new project
    UPDATE mc_tasks
    SET    project_id = new_project_id
    WHERE  board_id = rec.board_id;

    -- Record the link on the board row for audit trail before we drop it
    UPDATE mc_boards
    SET    sparti_project_id = new_project_id
    WHERE  id = rec.board_id;
  END LOOP;
END;
$$;

-- Handle any orphaned tasks (board had no tasks when processed above, but board has no project_id)
-- These get a fresh project as well.
DO $$
DECLARE
  rec            RECORD;
  new_project_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT
           b.id          AS board_id,
           b.user_id,
           b.name,
           b.description,
           b.sparti_brand_id,
           b.status,
           b.created_at,
           b.updated_at
    FROM   mc_boards b
    WHERE  b.sparti_project_id IS NULL
  LOOP
    INSERT INTO projects (
      user_id, title, description, brand_id,
      status, is_active,
      created_at, updated_at
    )
    VALUES (
      rec.user_id, rec.name, rec.description, rec.sparti_brand_id,
      CASE WHEN rec.status = 'active' THEN 'active' ELSE 'archived' END,
      rec.status = 'active',
      rec.created_at, rec.updated_at
    )
    RETURNING id INTO new_project_id;

    UPDATE mc_tasks
    SET    project_id = new_project_id
    WHERE  board_id = rec.board_id AND project_id IS NULL;

    UPDATE mc_boards SET sparti_project_id = new_project_id WHERE id = rec.board_id;
  END LOOP;
END;
$$;

-- ── Step 4: Enforce NOT NULL on project_id ────────────────────────────────────
-- Any remaining NULL project_ids belong to tasks with no board (shouldn't exist
-- given the ON DELETE CASCADE that was on board_id, but guard anyway).

DELETE FROM mc_tasks WHERE project_id IS NULL;

ALTER TABLE mc_tasks ALTER COLUMN project_id SET NOT NULL;

-- ── Step 5: Add index for efficient project-scoped task queries ───────────────

CREATE INDEX IF NOT EXISTS mc_tasks_project_id_user_id
  ON mc_tasks (project_id, user_id);

-- ── Step 6: Drop old FK on board_id, make it nullable (vestigial) ────────────

ALTER TABLE mc_tasks DROP CONSTRAINT IF EXISTS mc_tasks_board_id_fkey;
ALTER TABLE mc_tasks ALTER COLUMN board_id DROP NOT NULL;

-- ── Step 7: Drop mc_boards (all data migrated to projects) ────────────────────

DROP TABLE IF EXISTS mc_boards CASCADE;

-- ── Step 8: RLS on mc_tasks — add project_id-based policy ────────────────────
-- The existing user_id policies still apply. No change needed since mc_tasks
-- still has user_id and all existing policies use auth.uid() = user_id.

COMMIT;
