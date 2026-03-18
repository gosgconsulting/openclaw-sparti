# Change log

Chronological log of notable changes: what changed, why, risk, and rollback.

---

## Entry template (copy for new entries)

```markdown
### YYYY-MM-DD — Short title

- **Change:** What was done (files, behavior).
- **Reason:** Why (e.g. refactor, bugfix, dependency).
- **Risk:** Low / Medium / High — and why.
- **Rollback:** How to revert (e.g. revert commit, restore file, feature flag).
```

---

## Entries

### 2026-03-18 — Mission Control plan documented

- **Change:** Added Mission Control plan to `docs/PLAN.md` (findings, duplicate risks, 6-phase execution plan, reuse targets, definition of done). Updated `TODO.md` with phase-by-phase next steps. No code changes.
- **Reason:** User requested a Mission Control interface (work orchestration, approval governance, structured audit trail, agent lifecycle) inspired by abhi1693/openclaw-mission-control. Plan establishes what already exists (gateway control, connectors, auth, schemas — all reusable), what needs to be built (boards/tasks/approvals/audit_events data model, `/mission-control` route module, page generator, `audit.js` helper), and the prerequisite refactor (server.js split, Phase 0).
- **Risk:** Low. Documentation only; no behavior changed.
- **Rollback:** Remove Mission Control section from `docs/PLAN.md` and revert `TODO.md`.

---

### 2026-03-18 — Add "Open console" button to dashboard

- **Change:** Added "Open console" link button to `src/dashboard-page.js` actions bar (between "Publish public URL" and "Admin"). Links to `/openclaw` which already exists as a password-protected proxy route that injects the gateway token into the URL and proxies to the OpenClaw gateway SPA.
- **Reason:** Users had no direct path from the SaaS dashboard to the full OpenClaw interface (chat, sessions, skills, config, logs, etc.). The `/openclaw` route already existed and was correctly auth-guarded; only the UI link was missing.
- **Risk:** Low. One-line HTML addition; no new routes, no token logic, no auth changes.
- **Rollback:** Remove the `<a class="btn small" href="/openclaw"...>Open console</a>` line from `dashboard-page.js`.

---

### 2025-03-18 — Initial refactor docs and repo assessment

- **Change:** Added minimal refactor docs: `docs/README.md`, `docs/PLAN.md`, `docs/LOG.md`. No code changes.
- **Reason:** Give Cursor and maintainers a single place for purpose, architecture, module map, coding rules, backlog, and change history so refactors stay aligned and auditable.
- **Risk:** Low. Documentation only; behavior unchanged.
- **Rollback:** Remove the three files under `docs/` if not needed.

---

### Initial assessment (this repo)

- **Stack:** Node (ESM), Express 5, Supabase (auth + optional app_settings), Composio, OpenClaw gateway (child process or adopted daemon). Config via JSON + Ajv schemas in `src/schema/`.
- **Structure:** Single large entry point `src/server.js` (~2.2k+ lines) wires health, login, auth, onboard, lite, dashboard, openclaw proxy, backup/restore/upgrade, and SaaS bootstrap. Other modules (gateway, proxy, terminal, schema, channels, *-page.js) are already separated.
- **Auth:** Two paths: (1) Supabase cookies + `requireUser()` for `/auth`, `/dashboard`; (2) setup-password (Bearer/query/cookie) for `/onboard`, `/lite`. Both used in server.js.
- **Refactor priorities:** (1) Split server.js into routers/handlers; (2) Extract config bootstrap and backup/restore; (3) Clarify auth surface; (4) Extract API handlers; (5) Centralize env/constants. See `docs/PLAN.md`.
