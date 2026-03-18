---
name: sparti-context
version: 1.0.0
description: Access the user's Sparti account — brands, agents, projects, copilot tools — and launch agents or trigger Supabase edge functions directly from the bot.
---

# Sparti Context Skill

You have access to the user's full Sparti account through the `/api/sparti/*` endpoints on this server.

## Base URL

All endpoints are on this same server: `http://localhost:$PORT` (use `$PORT` env var).

## Authentication

All requests require the `SETUP_PASSWORD` as a Bearer token:

```
Authorization: Bearer $SETUP_PASSWORD
```

---

## Account Summary

Get a quick overview of the user's Sparti account:

```
GET /api/sparti/summary
```

Returns counts of brands, agents, projects, copilot instances, and app tools.

---

## Brands

List all brands:
```
GET /api/sparti/brands
```

Get a specific brand:
```
GET /api/sparti/brands/:id
```

---

## Agents

List all agents (both AI agents and custom agents):
```
GET /api/sparti/agents
```

Get a specific agent:
```
GET /api/sparti/agents/:id
```

Each agent has:
- `id`, `name`, `instructions`, `source` (`ai_agents` or `custom_agents`)
- `is_active`, `usage_count`, `last_used_at`

---

## Projects

List all projects:
```
GET /api/sparti/projects
```

Get a specific project:
```
GET /api/sparti/projects/:id
```

---

## Copilot Tools

List all copilot instances, templates, and app tools:
```
GET /api/sparti/copilot-tools
```

Get a specific copilot instance:
```
GET /api/sparti/copilot-tools/instances/:id
```

---

## Launch an Agent

Start a new conversation with a Sparti agent. Optionally provide brand and project context:

```
POST /api/sparti/agents/:id/launch
Content-Type: application/json

{
  "message": "Hello, let's get started",
  "brand_id": "uuid-optional",
  "project_id": "uuid-optional",
  "model": "optional-model-override"
}
```

Returns:
```json
{
  "agent": { "id": "...", "name": "..." },
  "reply": "The agent's first response",
  "session_id": "optional-session-id"
}
```

---

## Chat with an Agent

Send a message to a Sparti agent with optional conversation history:

```
POST /api/sparti/agents/:id/chat
Content-Type: application/json

{
  "message": "Your message here",
  "history": [
    { "role": "assistant", "content": "Previous response" },
    { "role": "user", "content": "Previous message" }
  ],
  "brand_id": "uuid-optional",
  "project_id": "uuid-optional",
  "model": "optional-model-override"
}
```

Returns:
```json
{
  "agent": { "id": "...", "name": "..." },
  "reply": "The agent's response"
}
```

---

## List Available Edge Functions

```
GET /api/sparti/edge-functions
```

Returns a list of available Supabase edge functions with their slugs, names, and descriptions.

---

## Invoke a Supabase Edge Function

Trigger any Supabase edge function by its slug:

```
POST /api/sparti/edge/:slug
Content-Type: application/json

{ ...function-specific body... }
```

### Common edge functions:

| Slug | Purpose |
|------|---------|
| `llmgateway-chat` | Chat with any LLM via the gateway |
| `kie-chat` | Chat via Kie.ai |
| `workflow-ai` | Run AI workflow automation |
| `execute-workflow` | Execute a saved workflow |
| `content-writing-workflow` | Run the content writing pipeline |
| `articles-workflow` | Full article generation workflow |
| `brand-voice-profile` | Generate or retrieve brand voice profile |
| `generate-featured-image` | Generate a featured image |
| `keyword-research` | Run keyword research |
| `ai-seo-analysis` | Analyze SEO for a URL |
| `composio-proxy` | Proxy Composio tool calls |
| `integrations-status` | Check all integration statuses |
| `test-sparti-connection` | Test Sparti connectivity |
| `sync-article-sparti` | Sync an article to Sparti |
| `perplexity-deep-search` | Deep web search |
| `firecrawl-scrape` | Scrape a URL |
| `firecrawl-search` | Search the web |
| `kie-image` | Generate images via Kie.ai |
| `kie-video` | Generate videos via Kie.ai |

### Example: Trigger project-doc-planner workflow

```
POST /api/sparti/edge/workflow-ai
{
  "workflow": "project-doc-planner",
  "brand_id": "uuid",
  "project_id": "uuid"
}
```

### Example: Generate brand voice profile

```
POST /api/sparti/edge/brand-voice-profile
{
  "brand_id": "uuid",
  "website_url": "https://example.com"
}
```

---

## Typical Workflows

### "Show me my brands"
1. Call `GET /api/sparti/brands`
2. Format the list for the user

### "Launch the SEO agent for my brand"
1. Call `GET /api/sparti/agents` to find the SEO agent
2. Call `GET /api/sparti/brands` to find the brand
3. Call `POST /api/sparti/agents/:id/launch` with `brand_id`
4. Reply with the agent's response

### "Chat with my content writer agent"
1. Find the agent ID from `GET /api/sparti/agents`
2. Use `POST /api/sparti/agents/:id/chat` with the user's message
3. Relay the reply back to the user
4. Keep `history` in memory for follow-up messages

### "Run the content writing workflow for my project"
1. Find the project ID from `GET /api/sparti/projects`
2. Call `POST /api/sparti/edge/content-writing-workflow` with the project details
3. Report the result

### "Trigger project-doc-planner"
```
POST /api/sparti/edge/workflow-ai
{
  "workflow": "project-doc-planner"
}
```

---

## Error Handling

| HTTP | Meaning |
|------|---------|
| 400 | Bad request — missing required field |
| 401 | Not authenticated — check SETUP_PASSWORD |
| 404 | Resource not found |
| 502 | Edge function call failed — check function logs |
| 500 | Server error — check gateway logs |
