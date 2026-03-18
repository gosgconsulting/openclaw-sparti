---
name: project-doc-planner
description: Mandatory workflow for implementation/refactor tasks. Prevents duplicate systems and keeps docs aligned with code. Always read docs first, reuse existing modules, and update docs after changes. Use when planning or executing implementation work, refactors, or when the user asks for a structured approach to code changes.
---

# Project Doc Planner (Lean + Strict)

## Source of Truth

- `README.md` → stable architecture, conventions, decisions
- `TODO.md` → active execution state (now/next/blockers/verification)

---

## Mandatory Workflow (Do in order)

1. **Read docs first**
   - Read `README.md`
   - Read `TODO.md`

2. **Scan existing implementation before proposing changes**
   - Inspect relevant routes, components, hooks, services, schemas, stores, utilities
   - Check if request already exists fully/partially

3. **Duplicate check (required)**
   - Identify potential duplicates in:
     - routes
     - business logic
     - UI components
     - state management
     - API/service layer
     - docs
   - Prefer reuse/refactor over adding new files

4. **Plan before coding**
   - Write a short execution plan (3–7 steps)
   - Mark which existing modules will be reused
   - Note intended doc updates (`README.md`, `TODO.md`)

5. **Implement**
   - Keep changes minimal and traceable
   - Follow existing patterns unless intentionally improving them
   - If introducing a new pattern, document why

6. **Update docs immediately after coding**
   - Update `README.md` **only if** architecture/conventions/decisions changed
   - Update `TODO.md` with:
     - completed work
     - remaining tasks
     - blockers
     - next steps
     - verification notes

7. **Verify**
   - Build/typecheck
   - Lint
   - Run impacted tests (or explain why not)
   - Quick manual check of affected flows/routes

---

## Hard Rules

- Do **not** create duplicate routes/helpers/hooks/services/schemas/stores/components.
- Do **not** introduce new abstractions if existing ones can be extended.
- If duplication is found, propose consolidation in the plan and execute if safe.
- If task scope is unclear, inspect current code paths first, then ask targeted questions.
- Keep docs consistent with actual behavior in code (no stale docs).

---

## Required Output (Before Coding)

### Findings

- Existing systems relevant to request
- Partial implementations already present
- Duplicate risks found
- Reuse targets

### Plan

1. ...
2. ...
3. ...

### Docs to Update

- `README.md`: (yes/no + what)
- `TODO.md`: (what entries will be added/updated)

---

## Required Output (After Coding)

### Completed

- Concrete changes made

### Reused / Consolidated

- Existing modules reused
- Duplicates removed/avoided

### Docs Updated

- `README.md`: exact sections changed
- `TODO.md`: exact items added/updated

### Verification

- Build/typecheck: pass/fail
- Lint: pass/fail
- Tests: pass/fail/not run (+ reason)
- Manual checks performed

---

## Documentation Policy

### `README.md` (long-lived only)

- architecture and boundaries
- module responsibilities
- conventions and key decisions
- important tech debt (structural)

### `TODO.md` (execution ledger)

- in progress / next / blocked / done
- short verification notes
- immediate follow-ups

---

## Priority

1. Correctness
2. Consistency with existing architecture
3. Reuse/unification
4. Speed
