# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Mission Control planning** — Plan written and documented in `docs/PLAN.md`. Ready to begin Phase 0 (server.js split).

---

## Next

### Mission Control (new feature)

- **Phase 0** — Split `server.js` into route modules: `src/routes/auth.js`, `src/routes/onboard.js`, `src/routes/lite.js`, `src/routes/dashboard.js`, `src/routes/openclaw.js`. Extract `src/config-bootstrap.js` and `src/backup.js`. Prerequisite for all Mission Control work.
- **Phase 1** — Write and apply four Supabase migrations: `boards`, `tasks`, `approval_requests`, `audit_events`. All with RLS scoped to `auth.uid()`.
- **Phase 2** — Implement `src/routes/mission-control.js` router (14 endpoints, all behind `requireUser()`). Mount at `/mission-control` in `server.js`.
- **Phase 3** — Implement `src/mission-control-page.js` HTML generator (6 sections: overview, boards, tasks, approvals, audit trail, gateway). Vanilla JS + fetch.
- **Phase 4** — Implement `src/audit.js` helper (`emitAudit`). Wire into gateway start/stop/restart, approval decisions, channel save, config change, backup/restore/upgrade.
- **Phase 5** — Add "Mission Control" link to `dashboard-page.js` actions bar. Add breadcrumb back to `/dashboard` from Mission Control page.

### Pending (pre-existing)

- **Run Supabase migration** — Apply `supabase/migrations/20260318_composio_connections.sql` to your Supabase project before testing connectors.
- **Set `COMPOSIO_API_KEY`** in Railway env vars — one key shared across all users. Get it from https://app.composio.dev → Settings → API Keys. Alternatively store in Supabase: `app_settings(key='composio', value={"api_key":"..."})`. Without it the Connectors tab shows the "Set COMPOSIO_API_KEY" warning.
- **Test connect flow end-to-end**: click Connect on a connector card → should redirect to `connect.composio.dev` → complete OAuth → should land back on `/dashboard#tab=connectors` with the card showing "connected".
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

---

## Done

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
