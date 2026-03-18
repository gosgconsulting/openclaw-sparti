# OpenClaw Sparti — Refactor Docs

Minimal documentation for Cursor and maintainers. Keeps the codebase aligned without doc bloat.

---

## Project purpose

This repo is the **OpenClaw Railway wrapper** (package: `openclaw-railway-wrapper`). It:

- Runs an Express server that **wraps** the [OpenClaw](https://github.com/openclaw/openclaw) gateway (personal AI assistant for messaging).
- Exposes **health**, **login**, **onboard** (setup wizard), **lite** (management dashboard), and **dashboard** (SaaS-style UI).
- **Auth**: Supabase (primary) for `/auth`, `/dashboard`, `/dashboard/*`; optional setup-password for `/onboard`, `/lite`.
- **Multi-tenancy (current)**: One OpenClaw runtime per deployment (single state dir, single gateway). All authenticated users share the same `/lite` and config. Per-user `instances` row in DB is metadata only. See `docs/PLAN.md` for a plan to add one child OpenClaw per user.
- **Integrations**: Supabase (auth + optional `app_settings` for LLM config), Composio (external tools).
- **SaaS bootstrap**: Can create `openclaw.json` from env (`LLM_GATEWAY_*`) or from Supabase `app_settings.key = 'llm_gateway'`.
- Proxies other traffic to the OpenClaw gateway; manages gateway process (start/stop/restart, logs, upgrades, backup/restore).

---

## High-level architecture

```
Request → Express 5 (server.js)
            ├── /health/*     → health.js (no auth)
            ├── /login        → auth flow
            ├── /auth         → Supabase login page
            ├── /dashboard/*  → requireUser() → dashboard UI + API
            ├── /onboard/*    → setup wizard (password or Supabase)
            ├── /lite/*       → lite panel (password)
            ├── /openclaw/*   → proxy to gateway (token in URL/fragment)
            └── /*            → proxy to OpenClaw gateway
```

- **Gateway**: Child process (or adopted daemon); state in `OPENCLAW_STATE_DIR` (default `/data/.openclaw`).
- **Config**: `openclaw.json` validated and migrated via `src/schema/` (Ajv + section schemas).
- **Secrets**: Never in frontend; Supabase and Composio used server-side only.

---

## Module map (short)

| Path | Responsibility |
|------|----------------|
| `src/server.js` | Express app, routes, auth wiring, SaaS bootstrap, backup/restore/upgrade handlers (large monolith). |
| `src/health.js` | Health router: `/health`, `/health/live`, `/health/ready`. |
| `src/auth.js` | Setup-password auth middleware (Bearer, query, cookie). |
| `src/auth-supabase.js` | Supabase session (cookies, `requireUser`). |
| `src/supabase.js` | Supabase client (anon + optional admin). |
| `src/gateway.js` | Gateway process manager (spawn, stop, logs, uptime, runCmd, restore, upgrade). |
| `src/gateway-rpc.js` | WebSocket JSON-RPC client to gateway. |
| `src/proxy.js` | Reverse proxy to gateway (HTTP + WS upgrade). |
| `src/terminal.js` | WebSocket PTY terminal (xterm.js). |
| `src/channels.js` | Channel definitions (17), icons, config builders. |
| `src/integrations/composio.js` | Composio app listing (server-side). |
| `src/schema/index.js` | Schema registry, validate, migrate, getAllSchemas. |
| `src/schema/validate.js` | Ajv wrapper. |
| `src/schema/migrate.js` | Legacy config migration. |
| `src/schema/form-meta.js` | UI metadata for config editor. |
| `src/schema/sections/*.json` | JSON Schema sections (agents, auth, channels, etc.). |
| `src/*-page.js` | HTML generators: onboard, ui (lite), auth, dashboard, console. |
| `test/*.test.js` | Unit and E2E tests (channels, config-builder, deploy-flow). |

---

## Coding / refactor guardrails

- **No secrets in frontend**: API keys, Supabase service role, Composio tokens, gateway token — server-only.
- **Business logic out of UI**: Keep *-page.js as presentational; move handlers and data shaping into server or dedicated modules.
- **One clear path per feature**: Avoid duplicate routes or duplicate flows for the same capability.
- **Prefer small, composable functions** and reuse existing helpers before adding new abstractions.
- **Config**: Validate with schema before write; use migrate for legacy shapes.
- **Tests**: Run `pnpm test` (or `npm test`) after changes; keep harness and fixtures in `test/helpers/`.

---

## Cursor workflow

- **Before major edits:** Read `docs/README.md` and `docs/PLAN.md`.
- **After major edits:** Update `docs/LOG.md` and mark progress in `docs/PLAN.md` (e.g. move items from “Current focus” to “Done” or backlog).
- **If architecture or module ownership changes:** Update the module map in this README.
