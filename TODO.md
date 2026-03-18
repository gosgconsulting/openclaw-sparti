# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Bot-initiated Composio OAuth: userId + callbackToken + /connected page (2026-03-19)** — Solved the problem of bot-sent OAuth links not knowing who the user is (no browser cookie available). Three-part fix: (1) `POST /api/composio/connect-link` now accepts `userId` (real Supabase UUID) and `returnTo` in the body. It embeds a short-lived HMAC-SHA256 signed `cbt` token in the callbackUrl query string — signed with `SETUP_PASSWORD`, TTL 20 min, constant-time verified. (2) `GET /dashboard/connectors/callback` now verifies `cbt` from query params as a fallback when no `composio_cb` cookie is present (bot flow). User resolution priority: cookie → token → live session. (3) Added `GET /connected` — a clean standalone "✅ Connected" page the user can close after OAuth; bot sets `returnTo: "/connected"` so users don't land in the full dashboard. `composio-connect` skill updated to v1.3.0 with new `userId`/`returnTo` fields.

- **Composio OAuth redirect-back to Mission Control (2026-03-19)** — After connecting a service via Composio OAuth, the callback was always redirecting to `/dashboard#tab=connectors&connect=success` regardless of where the user initiated the flow. Fixed with three changes: (1) Added `resolveReturnTo(req)` helper in `server.js` that reads `returnTo` from the POST body (preferred) or `Referer` header. (2) `setComposioCallbackCookie` now stores `returnTo` in the cookie payload; `readComposioCallbackCookie` returns it; `resolveCallbackReturnUrl` validates it (same-origin only, no open-redirect) and appends `&connect=success/failed`. (3) MC page's connect button now sends `{ returnTo: '/mission-control#integrations' }` in the POST body. (4) MC page init now detects `connect=success/failed` in the hash, auto-opens Integrations > Connectors tab, shows a flash toast, and reloads the connector list.

- **MC Integrations > Channels "No channels available" fixed (2026-03-19)** — `loadIntChannels()` was calling `/api/schemas` (returns raw JSON Schema objects, not channel definitions) and looking for `chJson.channelGroups` which never existed. Added `GET /mission-control/api/channels` route in `src/routes/mission-control.js` that returns `{ channels: CHANNEL_GROUPS }`. Updated `loadIntChannels()` to call the new endpoint and read `chJson.channels`. All 17 channels now render correctly.

- **Mission Control 500 on page load fixed (2026-03-19)** — `getMissionControlPageHTML` was crashing at render time with `ReferenceError: p is not defined`. Two unescaped `${p.slug}` interpolations in the Prompts table template (lines 2068, 2076) were being evaluated server-side instead of client-side. Fixed by escaping both to `\${esc(p.slug)}`. Verified with `node --eval` import test.

- **Composio auth configs catalog (2026-03-19)** — Connectors tab now dynamically built from the 30 auth configs in the Composio account. No more hardcoded 3-connector list. New API key `ak_AFQDM9XqtOvTxTPab9lQ` confirmed working. See Done section.



- **Mission Control Integrations panel + dashboard refactor (2026-03-19)** — Integrations panel (Channels + Connectors tabs) added to Mission Control sidebar. "Open console" button added to MC dashboard panel. Dashboard link removed from MC sidebar footer. Skills tab removed from `/dashboard` (Channels + Connectors only remain). See Done section.

- **Mission Control event wiring (2026-03-18)** — Bot actions now auto-emit to `mc_audit_events`. See Done section.
- **Composio connector fixes (2026-03-19)** — Two bugs fixed: `google_super` ToolkitNotFound 404 and GitHub OAuth callback auth loop. See Done section.
- **Mission Control v2 implemented (2026-03-18)** — Full dashboard matching openclaw-mission-control reference UI. Supabase migrations applied. 66/66 tests pass.
- **Skills tab + bundled skills** — Skills tab added to dashboard. `composio-connect` and `polymarket-clob` skills are now bundled and auto-activated for every account on every boot.
- **TOOLS.md now always overwritten on boot** — Bot will see all bundled skills (including `composio-connect`) in its system prompt after next gateway restart.
- **Sparti Context feature implemented (2026-03-19)** — Bot can now read brands, agents, projects, copilot tools from the Sparti database and launch agents or trigger edge functions directly from chat.
- **Sparti Context bot auth fixed (2026-03-19)** — Added `requireUserOrBot()` to `auth-supabase.js`. `/api/sparti/*` now accepts `SETUP_PASSWORD` Bearer + `x-user-id` header. Admin client + `scopeToUser()` used for bot path to maintain user data isolation without requiring a browser session.
- **Prompts / shortcode system implemented (2026-03-19)** — `mc_prompts` table live. `/mission-control/api/prompts` CRUD + `/run` endpoint. `prompt-runner` and `skill-creator` skills bundled. Prompts panel in Mission Control UI. Bridge columns on `mc_agents` and `mc_boards`.

---

## Next

### Mission Control (follow-up)

- **Migration applied** ✅ — `mc_boards`, `mc_tasks`, `mc_approval_requests`, `mc_audit_events`, `mc_tags`, `mc_agents`, `mc_board_groups` all live in Supabase with RLS.
- **Gateway audit wired** ✅ — `gateway.started`, `gateway.stopped`, `gateway.restarted` now emit to `mc_audit_events`.
- **Install `mission-control-events` skill** — Copy `skills/mission-control-events/` to the OpenClaw gateway's skills directory so the bot can push raw message/session events. Without it, only server-side actions (agent launch, edge functions, gateway control) are tracked automatically.
- **Wire channel save audit** — Add `emitAudit` to `POST /dashboard/channels/:name` so channel config changes appear in the audit trail.
- **Phase 0 (server.js split)** — `server.js` is ~2500 lines. Split into `src/routes/auth.js`, `src/routes/onboard.js`, `src/routes/lite.js`, `src/routes/dashboard.js`, `src/routes/openclaw.js`. Extract `src/config-bootstrap.js` and `src/backup.js`.

### Prompts / Shortcodes (follow-up)

- **Apply migration** ✅ — `mc_prompts` table + bridge columns on `mc_agents`/`mc_boards` applied to Supabase.
- **Install `prompt-runner` skill** — Copy `skills/prompt-runner/` to the OpenClaw gateway's skills directory. Once active, the bot will intercept `/slug` messages automatically.
- **Install `skill-creator` skill** — Copy `skills/skill-creator/` to the gateway's skills directory. Once active, the user can say "save this as /shortcode" to create prompts from chat.
- **Test `/project-doc-planner`**: create a prompt with slug `project-doc-planner`, type `/project-doc-planner` in the bot → bot should call `/mission-control/api/prompts/project-doc-planner/run` and execute the workflow.
- **Test skill creation from chat**: say "save /seo-agent that launches agent X for brand Y" → bot should call `POST /mission-control/api/prompts` and confirm.
- **Mission Control Prompts panel**: visit `/mission-control#prompts` → should list prompts, allow create/edit/delete.
- **Bridge columns**: when creating a board, optionally link it to a Sparti brand or project via `sparti_brand_id`/`sparti_project_id`. When creating an agent, link it to a real Sparti agent via `sparti_agent_id`/`sparti_agent_source`.

### Sparti Context (follow-up)

- **Skills are auto-bundled** ✅ — `sparti-context`, `prompt-runner`, `skill-creator` are in `skills/` → copied to `/bundled-skills/` in Docker → synced to `$OPENCLAW_STATE_DIR/skills/` on every boot by `entrypoint.sh` → auto-enabled by `runPostStartupTasks`. No manual install needed.
- **Bot auth fixed** ✅ — `/api/sparti/*` now accepts `SETUP_PASSWORD` Bearer + `x-user-id` header via `requireUserOrBot()`. Admin client used for bot path; `scopeToUser()` adds `user_id` filter to all queries so data is still user-scoped.
- **Set `SPARTI_USER_ID` env var** — Set the Supabase user UUID in Railway env vars so the `sparti-context` skill can auto-populate `x-user-id` without asking the user each time.
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

- **Composio OAuth redirect disconnect fix (2026-03-19):** Supabase auth cookies now use `sameSite: 'lax'` so the session survives the top-level redirect back from Composio (with `strict`, cookies were dropped on that chain and users landed on `/auth`). Auth page preserves `location.hash` in the redirect input so that if the user does land on `/auth` (e.g. session expired), after login they are sent to the intended path with the fragment (e.g. `/dashboard#tab=connectors&connect=failed`). Verification: complete Composio OAuth from dashboard/Mission Control → user should remain logged in and land on the right tab; if redirected to /auth with a hash, sign in → redirect should include the hash.

- **Connectors page: all integrators, search bar, Google grouped (2026-03-19):** GET /dashboard/connectors now groups Google toolkits (gmail, googledrive, googlesheets, etc.) into one "Google Workspace" card with `children`; connect/reconnect/disconnect still use per-service keys. Dashboard and Mission Control Connectors tabs: added search input, client-side filter by name/description/key (and child names for grouped card), and render grouped card with expandable "Services" details. README Connectors section updated.
- **Bot connect API directly (2026-03-19):** composio-connect skill v1.2.0 — users can send one message with app name and API key (e.g. "connect productive.io with api: xyz"). Skill now includes a "Direct API key in message" section: patterns to recognize, extraction rules, toolkitKey derivation for unknown apps (normalize to slug), and security rule to never echo the key. Step-by-step decision logic updated to prioritize "key in message" → Flow 2 (connect-api-key) immediately. No server changes; existing POST /api/composio/connect-api-key already supports any toolkitKey. README Bot Connect Link section updated with one-line note on direct API key in chat.

- **Composio auth configs catalog (2026-03-19):**
  - `src/integrations/composio.js` — Added `listComposioAuthConfigs()` using `GET /api/v3/auth_configs`. Returns only the toolkits actually configured in the account (vs. the global catalog of thousands).
  - `src/server.js` — Replaced hardcoded 3-connector list with dynamic build from auth configs. Added `TOOLKIT_META` map for display names/descriptions for all 43 configured toolkits. Removed unused `pickAppByCandidates`, `normalizeKey`, and `listComposioApps` import. Connectors now sort recommended-first then alphabetically.
  - `skills/composio-connect/SKILL.md` — Updated auth type table to match all 43 auth configs in the account.
  - API key `ak_AFQDM9XqtOvTxTPab9lQ` verified working — returns all 43 auth configs. Key is read from `COMPOSIO_API_KEY` Railway env var (Supabase `app_settings` table does not exist).

- **Composio API-key connect flow (2026-03-19):**
  - `src/integrations/composio.js` — Added `connectWithApiKey(userId, toolkitKey, credentials, authScheme, composioApiKey)`. Supports `API_KEY`, `BEARER_TOKEN`, and `BASIC` auth schemes via `AuthScheme` helpers from `@composio/core`. Connection is immediately active — no redirect.
  - `src/server.js` — Added `POST /api/composio/connect-api-key` endpoint (SETUP_PASSWORD Bearer auth). Bot passes `toolkitKey`, `credentials`, and optional `authScheme`. Returns `{ ok: true, connectedAccountId }`.
  - `skills/composio-connect/SKILL.md` — Updated to v1.1.0. Now covers both OAuth flow (redirect link) and API-key flow (immediate). Includes auth type table for 30+ services, step-by-step decision logic, and error handling for both flows.
  - `README.md` — Added `POST /api/composio/connect-api-key` to Bot Connect Link API section. Updated Pre-bundled Skills table description for `composio-connect`.



- **Mission Control Integrations panel + dashboard refactor (2026-03-19):**
  - `src/mission-control-page.js` — Added "Integrations" nav section with Channels + Connectors sub-tabs. Channels tab loads channel groups from `/api/schemas` + current config from `/lite/api/config` and renders save forms posting to `/dashboard/channels/:name`. Connectors tab mirrors the `/dashboard` connectors panel (loads from `/dashboard/connectors`, supports connect/reconnect/disconnect). Added "Open console" button to Dashboard panel header linking to `/openclaw`. Removed "Dashboard" link from sidebar footer. Added CSS for integration card styles and active tab indicator.
  - `src/dashboard-page.js` — Removed Skills tab button, Skills panel HTML, `loadSkills()`, `toggleSkill()`, skills event listener. Only Channels and Connectors tabs remain.

- **Mission Control Integrations > Channels enabled-state fix (2026-03-19):** `loadIntChannels()` now reads channel config from `/lite/api/config` using the raw `openclaw.json.channels` shape (with legacy fallback to `config.channels`), so connected channels like Telegram show the correct Enabled badge.

- **Prompts / shortcode system (2026-03-19):**
  - `supabase/migrations/20260319_mc_prompts_and_bridges.sql` — `mc_prompts` table (RLS, unique slug per user, usage tracking) + bridge columns on `mc_agents`/`mc_boards`. Migration applied to Supabase.
  - `src/routes/mission-control.js` — Added prompts CRUD + `POST /api/prompts/:slug/run` (returns dispatch instructions). `mc_agents` GET enriches with real Sparti agent data. Boards/agents POST+PATCH accept bridge columns.
  - `skills/prompt-runner/SKILL.md` + `_meta.json` — Bot skill that intercepts `/slug` messages and executes saved prompts.
  - `skills/skill-creator/SKILL.md` + `_meta.json` — Bot skill that lets users save new prompts from chat and generate skill files.
  - `src/mission-control-page.js` — Prompts panel with table, create/edit/delete modal, type selector, JSON payload editor, type hints. "Automation" nav section added.
  - `README.md` — Prompts/Shortcodes API section + updated Pre-bundled Skills table.

- **Mission Control event wiring (2026-03-18):**
  - `src/routes/sparti-context.js` — Added `emitAudit` import. Now emits `bot.agent.launched`, `bot.agent.chat`, `bot.edge_function.invoked`, `bot.edge_function.failed` automatically on every corresponding API call — zero bot config needed.
  - `src/server.js` — Imported `emitAudit`. Gateway start/stop/restart routes now emit `gateway.started`, `gateway.stopped`, `gateway.restarted` to `mc_audit_events` via service-role client.
  - `src/server.js` — Added `POST /api/mc/events` endpoint (SETUP_PASSWORD Bearer auth). Bot skill or any internal caller can push arbitrary events with `{ user_id, event_type, actor, payload }`.
  - `skills/mission-control-events/SKILL.md` + `_meta.json` — Bot skill teaching OpenClaw when and how to push events, standard event type table, auto-emitted events list, error handling.
  - 66/66 tests pass.

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

- **TOOLS.md always-overwrite fix (2026-03-19):**
  - Root cause: TOOLS.md was written only once (`if (!existsSync(toolsPath))`). On existing deployments it was already written before `composio-connect` was added — so the bot's system prompt never mentioned the skill existed. Bot had no awareness to use it.
  - Fix: removed the `if (!existsSync)` guard — TOOLS.md is now **always overwritten** on every gateway start, so new bundled skills are always reflected.
  - Added explicit `## Composio Connect Links` section to TOOLS.md — tells the bot to use `composio-connect` skill when user asks to connect any app, and to NOT give manual instructions.
  - Added `## Polymarket CLOB API` section to TOOLS.md.
  - Added dynamic `## Additional Skills` section listing any other installed skills.
  - **To activate on existing deployment**: restart the gateway from `/lite` → gateway will rewrite TOOLS.md with all skill sections → bot will know to use `composio-connect` on next conversation.

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
