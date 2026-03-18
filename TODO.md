# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Composio connector fixes (2026-03-19)** — Two bugs fixed: `google_super` ToolkitNotFound 404 and GitHub OAuth callback auth loop. See Done section.
- **Mission Control v2 implemented (2026-03-18)** — Full dashboard matching openclaw-mission-control reference UI. Supabase migrations applied. 66/66 tests pass.
- **Skills tab + bundled skills** — Skills tab added to dashboard. `composio-connect` and `polymarket-clob` skills are now bundled and auto-activated for every account on every boot.
- **Sparti Context feature implemented (2026-03-19)** — Bot can now read brands, agents, projects, copilot tools from the Sparti database and launch agents or trigger edge functions directly from chat.

---

## Next

### Mission Control (follow-up)

- **Migration applied** ✅ — `mc_boards`, `mc_tasks`, `mc_approval_requests`, `mc_audit_events`, `mc_tags`, `mc_agents`, `mc_board_groups` all live in Supabase with RLS.
- **Wire `emitAudit` into gateway actions** — Add `emitAudit` calls in `server.js` for gateway start/stop/restart (`/lite/api/gateway/*`) and channel save (`POST /dashboard/channels/:name`) to complete the audit trail.
- **Phase 0 (server.js split)** — `server.js` is ~2500 lines. Split into `src/routes/auth.js`, `src/routes/onboard.js`, `src/routes/lite.js`, `src/routes/dashboard.js`, `src/routes/openclaw.js`. Extract `src/config-bootstrap.js` and `src/backup.js`.

### Sparti Context (follow-up)

- **Install `sparti-context` skill** — Copy `skills/sparti-context/` to the OpenClaw gateway's skills directory or use `npx clawhub install` if published. Then enable it from `/dashboard#tab=skills`.
- **Test agent launch**: ask the bot "launch my SEO agent for brand X" → bot should call `GET /api/sparti/agents`, find the agent, call `POST /api/sparti/agents/:id/launch` with `brand_id`, and reply with the agent's response.
- **Test edge function trigger**: ask the bot "run project-doc-planner" → bot should call `POST /api/sparti/edge/workflow-ai` with `{ "workflow": "project-doc-planner" }`.
- **Test account summary**: ask the bot "show me my Sparti account" → bot should call `GET /api/sparti/summary` and format the counts.
- **Optional: `SUPABASE_EDGE_FUNCTIONS` env var** — Set a comma-separated list of edge function slugs to restrict which functions the bot can invoke (e.g. `llmgateway-chat,workflow-ai,brand-voice-profile`). Without it, the full curated list is available.

### Pending (pre-existing)

- **Run Supabase migration** — Apply `supabase/migrations/20260318_composio_connections.sql` to your Supabase project before testing connectors.
- **Set `COMPOSIO_API_KEY`** in Railway env vars — one key shared across all users. Get it from https://app.composio.dev → Settings → API Keys. Alternatively store in Supabase: `app_settings(key='composio', value={"api_key":"..."})`. Without it the Connectors tab shows the "Set COMPOSIO_API_KEY" warning.
- **Test connect flow end-to-end**: click Connect on a connector card → should redirect to `connect.composio.dev` → complete OAuth → should land back on `/dashboard#tab=connectors` with the card showing "connected".
- **Test bot connect-link flow**: ask the bot "connect slack with composio" → bot should call `POST /api/composio/connect-link` → bot should reply with a `connect.composio.dev` link → clicking the link should complete OAuth.
- **Test Skills tab**: visit `/dashboard#tab=skills` → should list `searxng-local`, `composio-connect`, `polymarket-clob` with Enable/Disable buttons.
- **Set `POLYMARKET_PROXY_URL`** if Polymarket trading is needed — without it the bot will inform users that order placement is blocked from US IPs.
- **Consider webhook for token expiry** — subscribe to `composio.connected_account.expired` to auto-mark rows `expired` in `composio_connections` and prompt users to reconnect.
- Decide multi-tenant approach: Option A (multi-process on one app) vs Option B (one deployment per user).
- If Option A: implement instance ↔ state dir mapping, then instance-scoped gateway manager, then auth/routing for `/lite` and `/onboard`.
- Verify Telegram bot connects after save by checking `/lite/api/status` (channels field) and gateway logs at `/lite`.
- Consider adding a `/dashboard/api/diag` endpoint that exposes `openclaw channels status --probe` output so users can see channel connection errors directly in the dashboard.

---

## Blockers

- Telegram bot will not work if `openclaw.json` does not exist. Requires `LLM_GATEWAY_BASE_URL`, `LLM_GATEWAY_API_KEY`, `LLM_GATEWAY_MODEL_ID` env vars OR a row in `app_settings(key='llm_gateway')` in Supabase.

---

## Verification

- After saving Telegram token in dashboard: page should show green "telegram channel saved — gateway restarted." flash.
- Header should show "Gateway: running" in teal within ~5s.
- Visit `/lite` → Activity log should show "Telegram connected" or similar.
- After implementation of multi-tenant: confirm second user gets a separate instance (separate config, gateway, /lite scope); confirm first user's data is not visible to second user.
- **Mission Control**: visit `/` → should redirect to `/auth` when not logged in. After login → should redirect to `/mission-control`. All 6 sections should render. Create a board, add tasks, submit an approval request, check audit trail.

---

## Done

- **Sparti Context feature (2026-03-19):**
  - `src/routes/sparti-context.js` — Express router at `/api/sparti/*` (12 endpoints, all `requireUser()`). Reads `brands`, `ai_agents`, `custom_agents`, `projects`, `copilot_instances`, `copilot_templates`, `app_tools` from Sparti DB using user's access token (RLS-scoped). Exposes agent launch + chat via `llmgateway-chat` edge fn. Exposes generic edge function invocation at `POST /api/sparti/edge/:slug`.
  - `skills/sparti-context/SKILL.md` + `_meta.json` — Bot skill teaching OpenClaw to use all Sparti context endpoints, including agent launch/chat workflows and edge function triggers (project-doc-planner, content-writing-workflow, etc.).
  - `server.js` — Mounted `spartiContextRouter` at `/api/sparti`.
  - `README.md` — Added Sparti Context API section and skill to Pre-bundled Skills table.

- **Composio connector fixes (2026-03-19):**
  - **Bug 1 — `google_super` ToolkitNotFound 404:** Added `googleworkspace`, `google_workspace`, `google-workspace`, `googlesuperapp` to the candidate list in `pickAppByCandidates`. Removed hardcoded `'google_super'` fallback — `googleKey` is now `null` when not found in catalog. Connectors that aren't in the catalog render with an `unavailable` badge, a disabled Connect button, and a yellow warning message explaining the issue. No more silent 404 from Composio.
  - **Bug 2 — GitHub OAuth callback auth loop:** Removed `requireUser()` from `GET /dashboard/connectors/callback`. Added `setComposioCallbackCookie` (called at connect/reconnect time) that stores `{ userId, toolkitKey }` in a `httpOnly`, `sameSite=lax`, 15-minute cookie. Callback reads this cookie to identify the user without needing a live Supabase session. Falls back to live session if cookie is missing. Uses service-role Supabase client for the DB upsert. Added `connect=success` / `connect=failed` hash flash messages in the dashboard UI.

- **Mission Control v2 (2026-03-18) — full reference UI:**
  - Rebuilt `src/mission-control-page.js` to match openclaw-mission-control reference screenshots exactly.
  - Light-mode design with Inter font, sidebar nav matching reference: Dashboard, Live feed, Board groups, Boards, Tags, Approvals, Custom fields, Marketplace, Packs, Organization, Gateways, Agents.
  - Kanban board view: Inbox / In Progress / Review / Done columns with task cards, priority badges (HIGH/MEDIUM/LOW), assignee chips, tag pills.
  - Board/List view toggle on task panel.
  - Tags panel: color picker, slug, task count, edit/delete.
  - Agents panel: status dot (online/offline/busy), board assignment, edit/delete.
  - Skills Marketplace: reuses `/dashboard/api/skills`, search + category + risk filters, table view.
  - Gateways panel: running/stopped badge, start/stop/restart, log tail.
  - Live Feed panel: audit event stream with icons.
  - Board Groups: CRUD with modal.
  - New Supabase tables: `mc_board_groups`, `mc_tags`, `mc_agents` + `priority`/`column_status` columns on `mc_tasks`.
  - New API routes: board-groups CRUD, tags CRUD (with task counts), agents CRUD, live-feed.
  - 66/66 tests pass.

- **Mission Control implementation (2026-03-18):**
  - `src/audit.js` — `emitAudit(supabase, opts)` non-blocking helper.
  - `src/mission-control-page.js` — HTML generator (overview, boards, tasks, approvals, audit trail, gateway sections).
  - `src/routes/mission-control.js` — Express router at `/mission-control/*` (14 endpoints, all `requireUser()`). Emits audit events on all write actions.
  - `supabase/migrations/20260318_mission_control.sql` — `boards`, `tasks`, `approval_requests`, `audit_events` tables with RLS.
  - `server.js` — `GET /` redirects authenticated → `/mission-control`, unauthenticated → `/auth`. Mounted `missionControlRouter`.
  - `dashboard-page.js` — Added "⚡ Mission Control" link to actions bar.
  - Tests: 66/66 pass. No regressions.

- **Skills tab + bundled skills auto-activation (2026-03-19):**
  - Created `skills/polymarket-clob/SKILL.md` + `_meta.json` — geoblock guardrail for Polymarket CLOB API. Routes order placement through `POLYMARKET_PROXY_URL` when set; blocks and informs user when not set. Read-only market data always works.
  - `composio-connect` and `polymarket-clob` are now in `skills/` → bundled into Docker image → auto-copied to `$OPENCLAW_STATE_DIR/skills/` on every boot → auto-enabled for every account by `gateway.js` `runPostStartupTasks()`. No manual installation needed.
  - Added `GET /dashboard/api/skills` to `server.js` — reads skills dir, parses SKILL.md frontmatter for description/version, merges with config enabled state.
  - Added `POST /dashboard/api/skills/:name/toggle` to `server.js` — flips enabled flag in config, pushes to running gateway via RPC.
  - Added **Skills tab** to `dashboard-page.js` — tab button, panel, `loadSkills()` function, `toggleSkill()` function, click handler, hash restore.
  - Updated `README.md`: Pre-bundled Skills table, Skills API section, Bot Connect Link API section.

- **Composio bot connect-link (2026-03-18):**
  - Root cause: bot had no skill to generate a Composio Connect Link — it responded with generic text instructions instead of an actual link.
  - Added `POST /api/composio/connect-link` to `src/server.js` — protected by `SETUP_PASSWORD` Bearer token (no Supabase session needed), calls `generateConnectLink` with a stable `bot-shared` user ID, returns `{ redirectUrl }`.
  - Created `skills/composio-connect/SKILL.md` — teaches the bot to call the endpoint using `$SETUP_PASSWORD` and `$PORT`, then reply with the link. Includes toolkit key reference, error handling table, and reply template.
  - Created `skills/composio-connect/_meta.json`.
  - **To activate**: install the skill into the OpenClaw gateway (copy `skills/composio-connect/` to the gateway's skills directory or use `npx clawhub install` if published).



- **searxng-local skill always enabled for all accounts (2026-03-18):**
  - Removed `SEARXNG_URL` gate from initial config write in `src/gateway.js` — `searxng-local` is now enabled whenever the skill dir is present on disk (which it always is, since `entrypoint.sh` copies it every boot).
  - Removed `SEARXNG_URL` gate from `TOOLS.md` write — the Web Search section is now included for all accounts; if `SEARXNG_URL` is not set, the note tells the agent to set it.
  - Removed the redundant `SEARXNG_URL`-specific post-startup re-apply block — the generic disk-scan loop already handles re-enabling all skills found on disk, including `searxng-local`.
  - Updated `README.md`: Pre-bundled Skills and env vars table now reflect that the skill is always enabled.

- **Remove publish/public URL feature (2026-03-18):**
  - Removed `publishBtn` and `publicUrl` variables and their render slots from `src/dashboard-page.js` — dashboard actions bar now shows only "Open console" and "Admin".
  - Removed `POST /api/instances/:id/publish` route from `src/server.js`.
  - Removed `GET /i/:id` (token redirect shim) and `GET /console/:id` (token-gated console page) routes from `src/server.js`.
  - Removed `import { getInstanceConsolePageHTML } from './console-page.js'` from `src/server.js`.
  - Removed unused `import { randomBytes } from 'crypto'` from `src/server.js`.
  - Cleaned `public_url` from all four `SELECT` column lists in `src/server.js`.
  - Deleted `src/console-page.js` (entire file was only used by the removed routes).

- Plan created for "child OpenClaw per user" (findings, options, execution steps). See `docs/PLAN.md`.
- **Composio connector OAuth flow (2026-03-18):**
  - Created `supabase/migrations/20260318_composio_connections.sql` — `composio_connections` table with RLS, unique constraint on `(user_id, toolkit_key)`, status enum, auto-updated `updated_at`.
  - Added `generateConnectLink(userId, toolkitKey, origin, apiKey)` to `src/integrations/composio.js` — wraps `initiateComposioConnection` with correct callback URL pattern.
  - Wired `POST /dashboard/connectors/:key/connect` — calls `generateConnectLink`, upserts `initiated` row, returns `{ redirectUrl }` (browser redirects to Composio's hosted OAuth page).
  - Added `GET /dashboard/connectors/callback` — receives Composio redirect after OAuth, marks row `active` with `connected_account_id`, redirects to `/dashboard#tab=connectors`.
  - Wired `POST /dashboard/connectors/:key/reconnect` — same as connect (fresh link, resets row to `initiated`).
  - Wired `POST /dashboard/connectors/:key/disconnect` — fetches `connected_account_id`, calls `disconnectComposioAccount`, marks row `disconnected`.
  - Enriched `GET /dashboard/connectors` — queries `composio_connections` for the current user and merges `connected`/`status` badges into each connector card.
  - Updated `README.md`: added `COMPOSIO_API_KEY` to env vars table, added Connectors API section with full flow description.
- **Composio shared API key (2026-03-18):**
  - Added `getComposioApiKey()` helper in `server.js` — resolves key from `COMPOSIO_API_KEY` env var first, then falls back to `app_settings(key='composio', value.api_key)` in Supabase (same pattern as LLM gateway). One key shared across all users; individual sessions scoped by `userId` inside Composio.
  - All connector routes (`connect`, `reconnect`, `disconnect`, `GET /connectors`) now use `getComposioApiKey()` instead of reading `process.env.COMPOSIO_API_KEY` directly.
  - All `composio.js` exports now accept an optional explicit `apiKey` param so the resolved key is threaded through without re-reading env.
  - Added `COMPOSIO_API_KEY` to `.env.example` with instructions.
- **Telegram bot fix (2026-03-18):**
  - Root cause: `POST /dashboard/channels/telegram` only started the gateway if it was stopped. If already running, the new `botToken` was written to config but the gateway was never restarted — so OpenClaw never picked up the Telegram channel.
  - Fix: changed the route to always stop + restart the gateway after a successful `config set`, ensuring the new channel config takes effect immediately.
  - Added: success flash message ("telegram channel saved — gateway restarted.") that auto-clears after 5s.
  - Added: live gateway status indicator in the dashboard header (polls `/lite/api/status` every 5s, shows "Gateway: running" in teal or "Gateway: stopped" in red).
