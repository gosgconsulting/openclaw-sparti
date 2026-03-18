# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Child OpenClaw per user (plan)** — Plan and options documented in `docs/PLAN.md` (section "Child OpenClaw per user (multi-tenant)"). No implementation yet.

---

## Next

- Decide multi-tenant approach: Option A (multi-process on one app) vs Option B (one deployment per user).
- If Option A: implement instance ↔ state dir mapping, then instance-scoped gateway manager, then auth/routing for `/lite` and `/onboard`.

---

## Blockers

- None.

---

## Verification

- After implementation: confirm second user gets a separate instance (separate config, gateway, /lite scope); confirm first user’s data is not visible to second user.

---

## Done

- Plan created for "child OpenClaw per user" (findings, options, execution steps). See `docs/PLAN.md`.
