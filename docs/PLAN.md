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
