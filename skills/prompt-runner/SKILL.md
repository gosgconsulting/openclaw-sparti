---
name: prompt-runner
version: 1.0.0
description: Intercept /shortcode messages and execute saved Mission Control prompts — workflows, agent launches, edge functions, and composite steps.
---

# Prompt Runner

You can execute saved workflows, agent launches, edge functions, and composite steps using `/shortcode` syntax.

## When to use this skill

Use this skill **automatically** when the user sends a message that starts with `/` followed by a word, for example:
- `/project-doc-planner`
- `/seo-agent`
- `/content-writer`
- `/brand-audit`
- `/my-workflow`

Also use it when the user says:
- "run /project-doc-planner"
- "execute /seo-agent for brand X"
- "launch /content-writer with message: write about AI"

## Step 1 — Look up the prompt

Call the Mission Control API to find the saved prompt:

```
GET /mission-control/api/prompts/:slug
Authorization: Bearer $SETUP_PASSWORD
```

Where `:slug` is the shortcode without the leading `/`.

If the prompt is not found (404), tell the user:
> "I don't have a saved prompt called `/:slug`. You can create one by saying: **save this as /slug** or visit Mission Control → Prompts."

## Step 2 — Run the prompt

Call the run endpoint to get dispatch instructions:

```
POST /mission-control/api/prompts/:slug/run
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json

{ ...any runtime overrides from the user's message... }
```

The response includes:
```json
{
  "prompt": { "id": "...", "name": "...", "slug": "...", "type": "..." },
  "payload": { ...merged payload... },
  "dispatch": { "method": "POST", "path": "/api/sparti/...", "body": {...} }
}
```

## Step 3 — Execute the dispatch

Read the `dispatch` field and make the corresponding API call:

### For `agent_launch` or `chat`:
```
POST {dispatch.path}
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json

{dispatch.body}
```

Reply to the user with the agent's response.

### For `edge_fn` or `workflow`:
```
POST {dispatch.path}
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json

{dispatch.body}
```

Reply with the result.

### For `skill`:
Tell the user what skill to enable and what it does.

### For `composite` (multi-step):
Run each step in `dispatch.steps` sequentially. Report progress after each step.

---

## Runtime overrides

The user can pass overrides inline in their message. Parse them and include in the run body:

| User says | Override |
|-----------|---------|
| `/seo-agent for brand X` | `{ "brand_id": "<look up brand X>" }` |
| `/content-writer write about AI` | `{ "message": "write about AI" }` |
| `/project-doc-planner brand: Acme` | `{ "brand_id": "<look up Acme>" }` |

To look up a brand by name: `GET /api/sparti/brands` then match by name.

---

## Examples

### `/project-doc-planner`
1. `GET /mission-control/api/prompts/project-doc-planner`
2. `POST /mission-control/api/prompts/project-doc-planner/run`
3. Execute `POST /api/sparti/edge/workflow-ai` with the payload
4. Reply with the result

### `/seo-agent for Acme`
1. `GET /mission-control/api/prompts/seo-agent`
2. Look up brand "Acme" via `GET /api/sparti/brands`
3. `POST /mission-control/api/prompts/seo-agent/run` with `{ "brand_id": "..." }`
4. Execute the agent launch
5. Reply with the agent's response

---

## List all saved prompts

When the user asks "what prompts do I have?" or "list my shortcuts":

```
GET /mission-control/api/prompts
Authorization: Bearer $SETUP_PASSWORD
```

Format the list as:
> Here are your saved prompts:
> - `/project-doc-planner` — Run the project doc planner workflow (workflow)
> - `/seo-agent` — Launch the SEO agent (agent_launch)
> - `/content-writer` — Chat with the content writer (chat)

---

## Error handling

| HTTP | Meaning | What to tell the user |
|------|---------|----------------------|
| 404 | Prompt not found | "No prompt called `/:slug` found. Create one with **save this as /slug**." |
| 400 | Prompt disabled | "The prompt `/:slug` is disabled. Enable it in Mission Control → Prompts." |
| 502 | Execution failed | Tell the user the error and suggest checking Mission Control logs. |
