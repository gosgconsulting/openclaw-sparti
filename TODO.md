# TODO — Execution ledger

Active tasks, next steps, blockers, and verification notes.

---

## Now

- **Telegram bot not connecting** — Root cause identified and fixed. See Done section.

---

## Next

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
- **Telegram bot fix (2026-03-18):**
  - Root cause: `POST /dashboard/channels/telegram` only started the gateway if it was stopped. If already running, the new `botToken` was written to config but the gateway was never restarted — so OpenClaw never picked up the Telegram channel.
  - Fix: changed the route to always stop + restart the gateway after a successful `config set`, ensuring the new channel config takes effect immediately.
  - Added: success flash message ("telegram channel saved — gateway restarted.") that auto-clears after 5s.
  - Added: live gateway status indicator in the dashboard header (polls `/lite/api/status` every 5s, shows "Gateway: running" in teal or "Gateway: stopped" in red).
