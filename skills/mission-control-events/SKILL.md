---
name: mission-control-events
version: 1.0.0
description: Push events from the bot into Mission Control's Live Feed and audit trail. Call this after key actions so operators can see bot activity in real time.
---

# Mission Control Events Skill

You can push events into the Mission Control audit trail (Live Feed) so operators can see what you're doing in real time.

## When to push an event

Push an event **after** completing any of these actions:
- Receiving a user message (especially a command or request)
- Launching or chatting with a Sparti agent
- Invoking an edge function or workflow
- Completing a task, creating a board/task, or updating an approval
- Encountering an error on a significant action
- Starting or finishing a long-running job

You do **not** need to push events for every single message — focus on meaningful actions.

## Endpoint

```
POST http://localhost:$PORT/api/mc/events
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json
```

## Request body

```json
{
  "user_id": "<supabase-user-uuid>",
  "event_type": "bot.message.received",
  "actor": "bot",
  "payload": {
    "channel": "telegram",
    "message_preview": "first 120 chars of the message..."
  }
}
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string (UUID) | The Supabase user ID of the logged-in user. Get it from context or from `GET /api/sparti/summary` (check `user.id`). |
| `event_type` | string | Dot-namespaced event type (see table below). |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `actor` | string | Who triggered the event. Default: `"bot"`. Use `"user"` for user-initiated actions. |
| `payload` | object | Any relevant context. Keep it concise — it shows in the Live Feed. |

## Standard event types

Use these exact strings so Mission Control can display icons and filter correctly:

| Event type | When to use |
|------------|-------------|
| `bot.message.received` | User sent a message to the bot |
| `bot.message.sent` | Bot replied to the user |
| `bot.agent.launched` | Bot launched a Sparti agent (auto-emitted by `/api/sparti/agents/:id/launch`) |
| `bot.agent.chat` | Bot sent a message to a Sparti agent (auto-emitted by `/api/sparti/agents/:id/chat`) |
| `bot.edge_function.invoked` | Bot called a Supabase edge function (auto-emitted by `/api/sparti/edge/:slug`) |
| `bot.edge_function.failed` | Edge function call failed (auto-emitted) |
| `bot.task.created` | Bot created a Mission Control task |
| `bot.task.completed` | Bot marked a task as done |
| `bot.approval.requested` | Bot submitted an approval request |
| `bot.workflow.started` | Bot started a workflow |
| `bot.workflow.completed` | Bot finished a workflow |
| `bot.error` | Bot encountered an error |
| `bot.session.started` | New chat session started |

## Examples

### Record that the user sent a message

```json
POST /api/mc/events
{
  "user_id": "abc123",
  "event_type": "bot.message.received",
  "actor": "user",
  "payload": {
    "channel": "telegram",
    "preview": "launch the SEO agent for my brand"
  }
}
```

### Record a completed workflow

```json
POST /api/mc/events
{
  "user_id": "abc123",
  "event_type": "bot.workflow.completed",
  "actor": "bot",
  "payload": {
    "workflow": "content-writing-workflow",
    "brand": "Acme Corp",
    "duration_ms": 4200
  }
}
```

### Record an error

```json
POST /api/mc/events
{
  "user_id": "abc123",
  "event_type": "bot.error",
  "actor": "bot",
  "payload": {
    "action": "edge_function",
    "slug": "keyword-research",
    "error": "timeout after 60s"
  }
}
```

## How to get the user_id

The user ID is the Supabase UUID of the authenticated user. You can:
1. Use the user ID from the active Supabase session context (if available)
2. Call `GET /api/sparti/summary` — the response includes `user.id` if the endpoint exposes it
3. Store it in session memory after the first successful `/api/sparti/*` call

If you don't have the user_id, skip the event push — do not guess or fabricate a UUID.

## Error handling

| HTTP | Meaning |
|------|---------|
| 200 | Event recorded |
| 400 | Missing `event_type` or `user_id` |
| 401 | Wrong SETUP_PASSWORD |
| 503 | Supabase admin client not configured |

On error, log it but do not interrupt the main action — event recording is best-effort.

## Automatic events (no skill action needed)

These events are emitted **automatically** by the server whenever the corresponding action happens — you don't need to push them manually:

- `bot.agent.launched` — when `/api/sparti/agents/:id/launch` is called
- `bot.agent.chat` — when `/api/sparti/agents/:id/chat` is called
- `bot.edge_function.invoked` — when `/api/sparti/edge/:slug` is called
- `bot.edge_function.failed` — when an edge function call fails
- `gateway.started` / `gateway.stopped` / `gateway.restarted` — when gateway control actions are taken
- All Mission Control UI actions (board/task/approval/agent CRUD) — always emitted

Only push **additional** events for things not covered above (e.g. raw user messages, workflow completions, session starts).
