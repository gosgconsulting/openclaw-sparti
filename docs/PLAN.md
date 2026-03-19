# Refactor plan

Prioritized backlog, current focus, and definition of done for refactor tasks.

---

## Refactor backlog (prioritized)

1. **Split `server.js` into routers/handlers** — Extract route groups into dedicated modules (e.g. `routes/health.js`, `routes/onboard.js`, `routes/lite.js`, `routes/dashboard.js`, `routes/openclaw.js`) and mount them in `server.js`. Reduces monolith size and improves testability.
2. **Extract config bootstrap and backup/restore** — Move `ensureOpenClawConfigFromEnv`, `getSharedLlmGatewayConfigFromSupabase`, and backup/restore/upgrade logic into a dedicated module (e.g. `src/config-bootstrap.js`, `src/backup.js`) so `server.js` stays routing-focused.
3. **Clarify auth surface** — Document and optionally unify the two auth paths (Supabase for `/auth`/`/dashboard` vs setup-password for `/onboard`/`/lite`) so new routes get the right guard; avoid duplicating auth logic.
4. **Extract API route handlers** — Move inline handlers for `/onboard/api/*`, `/lite/api/*`, `/dashboard/api/*` into route modules or handler files to shrink `server.js` and group by feature.
5. **Shared constants and env** — Centralize `OPENCLAW_STATE_DIR`, `PORT`, cookie names, and optional env parsing in one small module for consistency.
6. **Schema and form metadata** — Already modular under `src/schema/`; keep any new config sections as new schema files + form-meta entries.

---

## Current focus

- **Sprint:** Establish refactor docs and baseline (this PLAN + LOG). No code change in this step.
- **Next:** Pick one item from backlog (recommended: #1 or #2) and implement in a single PR; update LOG and PLAN when done.

---

## Definition of done (refactor tasks)

- [ ] **Tests pass** — `pnpm test` (or `npm test`) succeeds; existing E2E and unit tests unchanged or updated intentionally.
- [ ] **No new secrets in frontend** — No API keys, service role keys, or gateway tokens in client-facing code or HTML.
- [ ] **LOG updated** — `docs/LOG.md` has a dated entry: what changed, why, risk, rollback note.
- [ ] **PLAN updated** — Completed item moved or marked done; “Current focus” updated if the sprint goal changed.
- [ ] **README module map** — If new files or responsibilities were introduced, `docs/README.md` module map is updated.

---

## Child OpenClaw per user (multi-tenant) — Plan

### Answers to your questions

1. **If I connect to another account, does it use the same instance?**  
   **Yes.** Right now there is a single OpenClaw runtime per deployment:
   - One `OPENCLAW_STATE_DIR` (e.g. `/data/.openclaw`), one `openclaw.json`, one gateway process.
   - `/lite` is protected by `wrapperAuth` (Supabase or setup password). Any authenticated user gets access to the **same** gateway, config, logs, and controls.
   - The Supabase `instances` table has one row per user (for the dashboard), but that row is metadata only; it does **not** map to a separate OpenClaw process or state directory.

2. **How can I create a child OpenClaw per user account?**  
   That requires true multi-tenancy: one OpenClaw runtime (state dir + gateway process) per user. See options and plan below.

---

### Findings (existing systems)

| Area | Current behavior |
|------|------------------|
| **Auth** | `wrapperAuth`: setup password OR `requireUser()` (Supabase). `/lite` and `/onboard` use it; no user→instance binding. |
| **Gateway** | `src/gateway.js`: single process, single `OPENCLAW_STATE_DIR` from env. No `instance_id` or `user_id` in spawn. |
| **Config** | Single `openclaw.json` in `OPENCLAW_STATE_DIR`. Dashboard channel save writes to this same file via `runCmd('config', 'set', ...)`. |
| **Supabase `instances`** | Table has `user_id`; dashboard auto-creates one row per user. Used for dashboard UI and publish (public URL). Not linked to a dedicated OpenClaw process. |
| **Routes** | `/lite/*` and `/onboard/*` use `wrapperAuth` but do not scope by `req.user.id` or instance; they always use the global state dir and gateway. |

**Reuse targets:** `requireUser()`, `instances` table (add binding to state dir / process), existing dashboard and lite UI (parameterize by instance).

**Duplicate risks:** Do not add a second “instance” concept; extend the existing `instances` table and auth to drive instance-scoped state dir and gateway.

---

### Options for “child OpenClaw per user”

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Multi-process on one app** | One wrapper process; N gateway processes (or N state dirs + 1 gateway per user). State dir e.g. `/data/instances/<instance_id>/` or per user_id. | Single deployment, full isolation per user. | Complex: process manager per instance, port allocation, proxy routing by instance. Higher memory/cpu. |
| **B. One deployment per user** | Each user gets their own Railway (or other) deployment; Supabase only for auth and mapping user → deployment URL. | Clear isolation, reuses current single-tenant design. | More infra cost and ops; need provisioning and URL mapping. |
| **C. Instance-scoped state dir + single gateway** | Keep one process but switch `OPENCLAW_STATE_DIR` per request (e.g. by instance_id). | Smaller change to wrapper. | OpenClaw gateway is single-process; switching state dir per request would require restart or multiple processes anyway, so this collapses into A or a hybrid. |

**Recommendation:** For “child OpenClaw per user” on a **single** Railway app, Option **A** (multi-process, instance-scoped state dirs) is the only way to get real per-user isolation. Option B is preferable if you can afford one deployment per user.

---

### Execution plan (Option A — multi-process, instance-scoped)

1. **Instance ↔ state dir mapping**
   - Add a column or convention for instance state dir, e.g. `instances.state_dir` or fixed pattern `/data/instances/<instance_id>/.openclaw`.
   - Ensure only the instance owner (user_id) can access that instance’s state dir and gateway.

2. **Gateway manager per instance**
   - Extend or replace the single gateway in `gateway.js` with an instance-aware manager: e.g. `getGatewayForInstance(instanceId)`, `startGateway(instanceId)`, `stopGateway(instanceId)`.
   - Each instance has its own state dir, port (e.g. from a pool or `INTERNAL_GATEWAY_PORT + instance_index`), and process. Store `instance_id → port` (and PID) in memory or in DB/cache.

3. **Auth and routing for /lite and /onboard**
   - Require Supabase auth for instance-scoped flows (no shared setup password for multi-tenant).
   - Resolve instance: e.g. `GET /lite` → requireUser → load user’s instance (existing `instances` row) → use that instance’s state dir and gateway for all /lite and /onboard APIs.
   - Optional: `GET /lite?instance_id=...` with check that `instance.user_id === req.user.id`.

4. **Proxy and dashboard**
   - Proxy traffic to the correct gateway by instance (e.g. `/openclaw` and gateway WebSocket) using resolved instance_id and port mapping.
   - Dashboard: already per-user instance; ensure “Admin” (/lite) and “Open public URL” point to the same instance (and that publish uses the correct gateway base URL if needed).

5. **Bootstrap and backup**
   - Bootstrap: create per-instance state dir and initial `openclaw.json` (from env or Supabase `app_settings`) when the instance is first created.
   - Backup/restore/upgrade: scope by instance (state dir and, if needed, process lifecycle).

6. **Docs and env**
   - Document: one OpenClaw runtime per instance; multiple instances = multiple processes/ports.
   - Env: e.g. `OPENCLAW_INSTANCE_PORTS_START`, or dynamic port assignment; document limits (max instances per node).

---

### Docs to update (when implementing)

- **README.md** (root): Describe multi-tenant mode: instance-scoped state dirs, one gateway process per instance, and that “another account” uses a different instance (different process/config).
- **docs/README.md**: Module map for any new modules (e.g. instance-manager, instance-scoped gateway); clarify that `/lite` and `/onboard` are instance-scoped when multi-tenant is enabled.
- **TODO.md**: Track “child OpenClaw per user” tasks (instance state dir, gateway manager, auth/routing, proxy, bootstrap, backup).


---

## Mission Control -- Plan

### Context

Build a Mission Control interface inspired by [abhi1693/openclaw-mission-control](https://github.com/abhi1693/openclaw-mission-control): a centralized operations and governance surface with work orchestration, approval-driven governance, structured audit visibility, and agent lifecycle management -- built inside this existing app, not as a separate stack.

---

### Findings (existing systems)

| Area | Current state | Reusable? |
|------|---------------|-----------|
| **Gateway control** | `/lite/api/gateway/*` -- start/stop/restart, uptime, logs | Yes -- reuse as-is |
| **Activity log** | `/lite/api/logs` -- real-time log streaming | Yes -- extend to structured audit store |
| **Session monitoring** | `/lite/api/stats` via gateway RPC | Yes -- reuse |
| **Memory management** | `/lite/api/memory/*` | Yes -- reuse |
| **Cron viewer** | `/lite/api/cron` | Yes -- reuse |
| **Security audit** | `/lite/api/security-audit` | Yes -- reuse |
| **Version / upgrade** | `/lite/api/version`, `/lite/api/upgrade` | Yes -- reuse |
| **Backup / restore** | `/lite/api/restore` | Yes -- reuse |
| **Web terminal** | `/lite/ws` xterm.js | Yes -- reuse |
| **Connector OAuth** | `/dashboard/connectors/*` + Composio | Yes -- reuse |
| **Supabase auth** | `requireUser()`, sessions, cookies | Yes -- all new routes use this |
| **Config schema** | `src/schema/` Ajv sections | Yes -- extend for new entities |
| **Instances table** | One row per user, metadata only | Extend -- add board/task/approval binding |
| **Work orchestration** | Not present | Build new |
| **Approval queue** | Only pairing approval exists | Build new |
| **Multi-agent lifecycle** | Single gateway per deployment | Future (depends on multi-tenant plan) |
| **Audit trail (structured)** | Not present -- log stream only | Build new |
| **Gateway federation** | Not present | Future phase |

### Duplicate risks

- Do **not** add a second gateway management UI -- link from Mission Control to `/lite`.
- Do **not** add a second auth flow -- all Mission Control routes use `requireUser()`.
- Do **not** add a second `instances` concept -- extend the existing table.
- Do **not** duplicate Composio connector logic -- reuse `src/integrations/composio.js`.
- Do **not** add a second log stream -- keep `/lite/api/logs` for raw gateway logs; `audit_events` table is the structured store.

---

### Phased execution plan

#### Phase 0 -- Prerequisites (must complete before adding routes)

1. **Split `server.js` into route modules** (backlog item #1). Target: `src/routes/auth.js`, `src/routes/onboard.js`, `src/routes/lite.js`, `src/routes/dashboard.js`, `src/routes/openclaw.js`. `server.js` becomes a thin mount file.
2. **Extract config bootstrap and backup/restore** into `src/config-bootstrap.js` and `src/backup.js` (backlog item #2).

#### Phase 1 -- Data model (Supabase migrations)

Four new tables, all with RLS scoped to `auth.uid()`:

| Table | Key columns |
|-------|-------------|
| `boards` | `id uuid PK`, `user_id uuid FK auth.users`, `name text`, `description text`, `status text`, `created_at` |
| `tasks` | `id uuid PK`, `board_id uuid FK boards`, `user_id uuid FK auth.users`, `title text`, `description text`, `status text` (todo/in-progress/done), `assignee_agent text`, `tags text[]`, `created_at` |
| `approval_requests` | `id uuid PK`, `user_id uuid FK auth.users`, `action_type text`, `payload jsonb`, `status text` (pending/approved/rejected), `decided_at timestamptz`, `decided_by text` |
| `audit_events` | `id uuid PK`, `user_id uuid FK auth.users`, `instance_id uuid FK instances`, `event_type text`, `actor text`, `payload jsonb`, `created_at` |

Tags stored as `text[]` on `tasks` -- no separate table needed initially.

#### Phase 2 -- Server routes (`src/routes/mission-control.js`)

New router module, mounted at `/mission-control`. All routes use `requireUser()`. No secrets in browser.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mission-control` | Mission Control page (HTML) |
| GET | `/mission-control/api/overview` | Gateway status + quick stats (tasks, approvals, sessions) |
| GET | `/mission-control/api/boards` | List user's boards |
| POST | `/mission-control/api/boards` | Create board |
| PATCH | `/mission-control/api/boards/:id` | Update board |
| DELETE | `/mission-control/api/boards/:id` | Archive board |
| GET | `/mission-control/api/boards/:id/tasks` | List tasks on a board |
| POST | `/mission-control/api/boards/:id/tasks` | Create task |
| PATCH | `/mission-control/api/tasks/:id` | Update task (status, assignee, tags) |
| DELETE | `/mission-control/api/tasks/:id` | Delete task |
| GET | `/mission-control/api/approvals` | List pending approvals |
| POST | `/mission-control/api/approvals` | Create approval request |
| POST | `/mission-control/api/approvals/:id/decide` | Approve or reject |
| GET | `/mission-control/api/audit` | Query audit events (filter by type, date range) |

#### Phase 3 -- UI (`src/mission-control-page.js`)

HTML generator following the same pattern as `dashboard-page.js` and `ui-page.js`. Vanilla JS + fetch. Sections:

1. **Overview** -- gateway status card (running/stopped/uptime), quick stats (open tasks, pending approvals, active sessions).
2. **Boards** -- list of boards; click into board shows tasks.
3. **Tasks** -- task list with status (todo / in-progress / done), assignee agent, tags. Create/edit inline.
4. **Approvals** -- pending approval queue; approve/reject with one click. Decision logged to audit.
5. **Audit trail** -- paginated table of structured audit events (type, actor, timestamp, payload summary).
6. **Gateway** -- embedded summary of gateway controls (start/stop/restart, recent log tail). Links to `/lite` for full panel.

#### Phase 4 -- Audit event emission (`src/audit.js`)

Thin helper: `emitAudit(supabase, { userId, instanceId, eventType, actor, payload })`. Non-blocking -- errors logged, never thrown.

Emit from key server actions:
- Gateway start / stop / restart
- Approval decided (approved or rejected)
- Channel saved
- Config changed
- Backup / restore / upgrade

#### Phase 5 -- Navigation wiring

- Add "Mission Control" link to `dashboard-page.js` actions bar (alongside "Admin" and "Open console").
- Add breadcrumb link back to `/dashboard` from Mission Control page.

#### Phase 6 -- Future (not in scope now)

- Multi-agent lifecycle management (depends on multi-tenant Option A/B decision).
- Gateway federation (connect and operate remote gateway environments).
- Composio token expiry webhook -- auto-emit audit event + mark row `expired`.
- Board groups and organizations (if multi-team use case emerges).

---

### Reuse targets

| Module | Used for |
|--------|---------|
| `requireUser()` -- `src/auth-supabase.js` | All Mission Control routes |
| `createSupabaseClient()` -- `src/supabase.js` | All DB reads/writes |
| `getGatewayInfo()`, `isGatewayRunning()`, `getGatewayUptime()` -- `src/gateway.js` | Overview card |
| `gatewayRPC()` -- `src/gateway-rpc.js` | Session count in overview |
| `escapeHtml()` / `toJsonForScript()` pattern -- `*-page.js` | Mission Control page |
| `/lite/api/status` data shape | Gateway card in Mission Control |

---

### Definition of done (Mission Control)

- [ ] Phase 0 complete: `server.js` split into route modules; config bootstrap and backup extracted.
- [ ] Phase 1 complete: all four Supabase migrations applied and tested with RLS.
- [ ] Phase 2 complete: all routes return correct data; `requireUser()` enforced; no secrets in responses.
- [ ] Phase 3 complete: Mission Control page renders all six sections; create/edit/delete/approve flows work end-to-end.
- [ ] Phase 4 complete: `audit_events` rows emitted for all key actions; visible in Audit trail section.
- [ ] Phase 5 complete: "Mission Control" link visible in dashboard; navigation works both ways.
- [ ] Tests pass: `pnpm test` succeeds; no regressions in existing flows.
- [ ] No secrets in frontend: no API keys, Supabase service role, gateway token, or Composio key in HTML/JS.
- [ ] Docs updated: `docs/README.md` module map, `docs/LOG.md` entry, `TODO.md` progress.

---

### Docs to update (when implementing)

- **docs/README.md**: Add `src/routes/mission-control.js`, `src/mission-control-page.js`, `src/audit.js` to module map. Update architecture diagram to include `/mission-control/*`.
- **docs/PLAN.md**: Move completed phases to Done; update Current focus sprint.
- **docs/LOG.md**: Dated entry per phase.
- **TODO.md**: Track phase-by-phase execution, blockers, and verification.
- **README.md** (root): Add Mission Control to API Endpoints table and Project Structure.

---

## Composio OAuth redirect flow (Clawdi-style)

### Reference flow (working on Clawdi)

1. User starts connect from app (e.g. Connectors tab).
2. App redirects to Composio Connect Link (`platform.composio.dev/link/lk_...`).
3. User completes OAuth on provider (e.g. Google consent).
4. Composio shows its own success page (`platform.composio.dev/link/...?status=success&connectedAccountId=ca_xxx&appName=googlesuper`), then redirects to the **app callback URL** (configured when creating the link).
5. App callback receives GET with `status=success` and `connected_account_id` (or `connectedAccountId`); app persists the connection and redirects to the final landing page.
6. Clawdi final URL: `https://www.clawdi.ai/connectors?status=success&connected_account_id=ca_xxx` — a dedicated `/connectors` page with query params for success state.

### Current openclaw-sparti flow

| Step | Implementation |
|------|----------------|
| 1–3 | Same: Connect button → Composio link → OAuth on provider. |
| 4 | Composio redirects to `GET /dashboard/connectors/callback?status=success&connected_account_id=ca_xxx&toolkit=...` (and optionally `cbt=` for bot flow). Callback is **not** behind `requireUser()` so the redirect from Composio works (no session required). |
| 5 | Callback reads user from `composio_cb` cookie (browser) or `cbt` token (bot), upserts `composio_connections`, restores Supabase session, then redirects to `returnTo` with hash `&connect=success` or `&connect=failed`. |
| 6 | Final URL today: `/dashboard#tab=connectors&connect=success` or `/mission-control#integrations&connect=success` or `/connected?toolkit=...` (bot). No dedicated `/connectors` route. |

### Findings

- **Callback URL**: Built in `generateConnectLink()` and `POST /api/composio/connect-link` as `${origin}/dashboard/connectors/callback?toolkit=...` (and `&cbt=` for bot). Composio appends `status` and `connected_account_id` (docs say snake_case; their intermediate page may show camelCase).
- **User resolution**: Cookie (browser) → signed `cbt` token (bot) → live Supabase session. Session restore from encrypted refresh token in cookie avoids second login after OAuth.
- **returnTo**: From POST body or Referer; validated same-origin; stored in cookie/token; used in `resolveCallbackReturnUrl()` to build final redirect.

### Duplicate / reuse

- Do **not** add a second callback URL or a second Composio integration path. Single callback: `/dashboard/connectors/callback`. Single integration: `src/integrations/composio.js`.

### Execution plan

1. **Callback param robustness** — Accept both `connected_account_id` (snake_case) and `connectedAccountId` (camelCase) from Composio redirect so the callback works regardless of which param Composio sends. Use the first present for DB upsert.
2. **Optional: Clawdi-style `/connectors` landing** — Add `GET /connectors` (auth required) that redirects to `/dashboard#tab=connectors`, and if query has `status=success` or `status=failed`, append `&connect=success` or `&connect=failed` to the hash. Allow `returnTo=/connectors` so the callback can redirect to `/connectors?status=success&connected_account_id=xxx`; then `/connectors` redirects to `/dashboard#tab=connectors&connect=success` and the dashboard shows the flash. This gives a Clawdi-style final URL without duplicating the connectors UI.
3. **Docs** — README and TODO already describe the flow; add note that `/connectors` is an alias for dashboard connectors tab when using Clawdi-style returnTo.

### Verification

- Click Connect on a connector (e.g. Google Super) → complete OAuth → land on dashboard or Mission Control with "Connector linked successfully" and connectors list updated.
- Bot: "connect Google with composio" → open link → complete OAuth → land on `/connected` or configured returnTo.
- If `/connectors` is added: set returnTo to `/connectors`, complete OAuth → land on `/connectors?status=success&...` → redirect to `/dashboard#tab=connectors&connect=success` and flash shown.

---

## Composio “linked” to dashboard (prerequisites and troubleshooting)

When OAuth succeeds in Composio but the connection does **not** show as linked in the OpenClaw dashboard or for the user, the break is between Composio’s redirect and the app’s persistence/UI.

### End-to-end chain

| Layer | What must be true |
|-------|-------------------|
| **Composio** | User completes OAuth; Composio redirects the browser to **our** callback URL (the one we sent when creating the link). |
| **Callback URL** | Must be the app’s real origin (e.g. `https://your-app.railway.app/dashboard/connectors/callback?toolkit=...`). Set from the request when the user clicks Connect in our app. |
| **Cookie** | User clicked “Connect” in **our** dashboard/Mission Control so we set the `composio_cb` cookie (userId, toolkitKey, returnTo). When Composio redirects back to our callback, the browser sends this cookie so we know **which user** to link. |
| **Database** | Table `composio_connections` exists (migrations applied); callback uses **service-role** client to upsert so RLS does not block the write. |
| **Dashboard** | GET `/dashboard/connectors` runs with the same user (Supabase session); RLS allows SELECT; UI shows `badges.connected` and `accounts` from the API. |

### Prerequisites (must have)

1. **Supabase migrations applied**
   - `supabase/migrations/20260318_composio_connections.sql` — creates `composio_connections` and RLS.
   - `supabase/migrations/20260319_composio_connections_multi_account.sql` — unique index for multiple accounts per toolkit.
   - Without these, the callback’s upsert fails or the table is missing.

2. **`SUPABASE_SERVICE_ROLE_KEY` set**
   - The callback does **not** require the user to be logged in (Composio redirect has no session). It identifies the user from the cookie and writes with a **service-role** client to bypass RLS. If this env var is missing, the callback falls back to the normal Supabase client; then `auth.uid()` is null and RLS blocks the insert, so the connection is never stored.

3. **`COMPOSIO_API_KEY` set**
   - Needed for generating the connect link and for listing auth configs. Without it, the Connectors tab shows a warning and connect may fail.

4. **User starts the flow from our app**
   - The link must be generated by our app (dashboard or bot) so that (a) the callback URL points to our server and (b) we set the `composio_cb` cookie. If the user opens a link from elsewhere (e.g. Composio dashboard with a different callback), our callback is never hit or we have no cookie and cannot resolve the user.

### Where it can break

- **Callback never hit** — Composio redirects to a different URL (e.g. wrong or old callback configured elsewhere). Fix: always start from “Connect” in our dashboard so we send the correct callback URL.
- **User not identified** — Cookie missing (e.g. different domain, cookie cleared, or link opened in another device). Fix: use same browser/session; for bot flow use the `cbt` token in the link.
- **DB write fails** — Migrations not applied, or no `SUPABASE_SERVICE_ROLE_KEY`. Fix: run migrations; set `SUPABASE_SERVICE_ROLE_KEY` in the environment.
- **Dashboard shows “Not connected”** — GET `/dashboard/connectors` uses `req.user.id`; if the user is different from the one in the cookie, or RLS blocks read, or the frontend cached an old list. Fix: ensure same user session; force reload connectors when landing with `connect=success`.

### Plan (frontend, database, backend)

1. **Database** — Document and verify: run both Composio migrations; confirm table and unique index exist.
2. **Backend** — Callback: require service-role for the upsert (return 503 or redirect to failed with a clear log if missing); log success/failure for debugging. No duplicate routes.
3. **Frontend** — When the dashboard or Mission Control loads with `connect=success` in the hash, force a fresh fetch of the connectors list (clear cache and call loadConnectors) so the new connection appears immediately.
4. **Docs** — README: add “Composio connectors: prerequisites” (migrations, `SUPABASE_SERVICE_ROLE_KEY`, `COMPOSIO_API_KEY`). TODO: add verification and troubleshooting note.
