# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Composio connector OAuth flow** — Implemented. Routes wired, Supabase table created. See Done section for details.
- **Telegram bot not connecting** — Root cause identified and fixed. See Done section.

---

## Next

- **Run Supabase migration** — Apply `supabase/migrations/20260318_composio_connections.sql` to your Supabase project before testing connectors.
- **Set `COMPOSIO_API_KEY`** in Railway env vars (and `.env` for local dev) — connector routes return 503 without it.
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

- Plan created for "child OpenClaw per user" (findings, options, execution steps). See `docs/PLAN.md`.
- **Composio connector OAuth flow (2026-03-18):**
  - Created `supabase/migrations/20260318_composio_connections.sql` — `composio_connections` table with RLS, unique constraint on `(user_id, toolkit_key)`, status enum, auto-updated `updated_at`.
  - Added `generateConnectLink(userId, toolkitKey, origin)` to `src/integrations/composio.js` — wraps `initiateComposioConnection` with correct callback URL pattern.
  - Wired `POST /dashboard/connectors/:key/connect` — calls `generateConnectLink`, upserts `initiated` row, returns `{ redirectUrl }` (browser redirects to Composio's hosted OAuth page).
  - Added `GET /dashboard/connectors/callback` — receives Composio redirect after OAuth, marks row `active` with `connected_account_id`, redirects to `/dashboard#tab=connectors`.
  - Wired `POST /dashboard/connectors/:key/reconnect` — same as connect (fresh link, resets row to `initiated`).
  - Wired `POST /dashboard/connectors/:key/disconnect` — fetches `connected_account_id`, calls `disconnectComposioAccount`, marks row `disconnected`.
  - Enriched `GET /dashboard/connectors` — queries `composio_connections` for the current user and merges `connected`/`status` badges into each connector card.
  - Updated `README.md`: added `COMPOSIO_API_KEY` to env vars table, added Connectors API section with full flow description.
- **Telegram bot fix (2026-03-18):**
  - Root cause: `POST /dashboard/channels/telegram` only started the gateway if it was stopped. If already running, the new `botToken` was written to config but the gateway was never restarted — so OpenClaw never picked up the Telegram channel.
  - Fix: changed the route to always stop + restart the gateway after a successful `config set`, ensuring the new channel config takes effect immediately.
  - Added: success flash message ("telegram channel saved — gateway restarted.") that auto-clears after 5s.
  - Added: live gateway status indicator in the dashboard header (polls `/lite/api/status` every 5s, shows "Gateway: running" in teal or "Gateway: stopped" in red).
