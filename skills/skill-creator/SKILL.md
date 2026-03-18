---
name: skill-creator
version: 1.0.0
description: Save workflows, agent launches, edge functions, and chat prompts as named /shortcodes directly from the bot. Also lets you create and update OpenClaw skills from chat.
---

# Skill Creator

You can save any workflow, agent launch, edge function call, or chat prompt as a named `/shortcode` directly from the bot — no dashboard needed.

## When to use this skill

Use this skill when the user says:
- "save this as /my-workflow"
- "create a shortcut /seo-agent that launches the SEO agent"
- "save /project-doc-planner as a workflow that runs workflow-ai"
- "make /content-writer chat with agent X for brand Y"
- "create a skill called /brand-audit"
- "update /my-workflow to use brand Z"
- "delete /old-workflow"
- "list my prompts"

---

## Saving a new prompt

### Step 1 — Understand what the user wants to save

Ask clarifying questions if needed:
- What should the shortcode be called? (e.g. `/seo-agent`)
- What should it do? (launch an agent / run a workflow / call an edge function / send a chat message)
- Which agent/workflow/edge function? (look up from Sparti if needed)
- Any default brand or project context?

### Step 2 — Build the payload

Based on the type:

**agent_launch** — launches an agent with optional brand/project context:
```json
{
  "type": "agent_launch",
  "payload": {
    "agent_id": "uuid-of-agent",
    "brand_id": "uuid-optional",
    "project_id": "uuid-optional",
    "message": "optional initial message"
  }
}
```

**chat** — sends a message to an agent with history:
```json
{
  "type": "chat",
  "payload": {
    "agent_id": "uuid-of-agent",
    "message": "default message if user doesn't override",
    "brand_id": "uuid-optional"
  }
}
```

**edge_fn** — calls a specific Supabase edge function:
```json
{
  "type": "edge_fn",
  "payload": {
    "edge_fn_slug": "brand-voice-profile",
    "brand_id": "uuid-optional"
  }
}
```

**workflow** — runs a workflow via workflow-ai edge function:
```json
{
  "type": "workflow",
  "payload": {
    "edge_fn_slug": "workflow-ai",
    "workflow": "project-doc-planner",
    "brand_id": "uuid-optional",
    "project_id": "uuid-optional"
  }
}
```

**composite** — runs multiple steps in sequence:
```json
{
  "type": "composite",
  "payload": {
    "steps": [
      { "type": "edge_fn", "edge_fn_slug": "brand-voice-profile", "brand_id": "uuid" },
      { "type": "agent_launch", "agent_id": "uuid", "brand_id": "uuid" }
    ]
  }
}
```

### Step 3 — Look up agent/brand IDs if needed

To find an agent by name:
```
GET /api/sparti/agents
Authorization: Bearer $SETUP_PASSWORD
```

To find a brand by name:
```
GET /api/sparti/brands
Authorization: Bearer $SETUP_PASSWORD
```

### Step 4 — Save the prompt

```
POST /mission-control/api/prompts
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json

{
  "name": "SEO Agent",
  "slug": "seo-agent",
  "description": "Launch the SEO agent for a brand",
  "type": "agent_launch",
  "payload": {
    "agent_id": "uuid",
    "brand_id": "uuid-optional"
  }
}
```

The slug is automatically cleaned (lowercased, spaces → dashes, special chars removed). You don't need to include the leading `/`.

On success, confirm to the user:
> Saved! You can now use `/seo-agent` to launch the SEO agent. Try it now by typing `/seo-agent`.

---

## Updating an existing prompt

```
PATCH /mission-control/api/prompts/:slug
Authorization: Bearer $SETUP_PASSWORD
Content-Type: application/json

{ "payload": { ...updated payload... } }
```

---

## Deleting a prompt

```
DELETE /mission-control/api/prompts/:slug
Authorization: Bearer $SETUP_PASSWORD
```

---

## Listing all prompts

```
GET /mission-control/api/prompts
Authorization: Bearer $SETUP_PASSWORD
```

---

## Creating a skill file from chat

When the user wants to create a new OpenClaw skill (not just a shortcode), you can generate the SKILL.md content:

1. Ask: what should the skill do? When should it activate? What API calls does it make?
2. Generate a SKILL.md following the OpenClaw skill format (YAML frontmatter + markdown body)
3. Tell the user to save it to `skills/<name>/SKILL.md` and `skills/<name>/_meta.json`
4. Optionally, if the server has write access to the skills directory, offer to save it directly

### SKILL.md template:
```markdown
---
name: my-skill
version: 1.0.0
description: What this skill does
---

# My Skill

## When to use this skill
...

## How to use it
...
```

### _meta.json template:
```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "author": "openclaw-sparti",
  "tags": ["tag1", "tag2"]
}
```

---

## Examples

### "Save a shortcut to run project-doc-planner"

User: "save /project-doc-planner as a workflow that runs the project-doc-planner workflow"

Steps:
1. Build payload: `{ "type": "workflow", "payload": { "edge_fn_slug": "workflow-ai", "workflow": "project-doc-planner" } }`
2. POST to `/mission-control/api/prompts` with slug `project-doc-planner`
3. Confirm: "Saved! Type `/project-doc-planner` to run it."

### "Create a shortcut to chat with my SEO agent for Acme brand"

User: "create /seo-acme that chats with the SEO agent for Acme brand"

Steps:
1. `GET /api/sparti/agents` → find SEO agent ID
2. `GET /api/sparti/brands` → find Acme brand ID
3. POST prompt with type `chat`, agent_id, brand_id
4. Confirm: "Saved! Type `/seo-acme` to start chatting with the SEO agent in Acme's brand context."

---

## Error handling

| HTTP | Meaning | What to tell the user |
|------|---------|----------------------|
| 409 | Slug already exists | "A prompt called `/:slug` already exists. Use a different name or say **update /slug** to modify it." |
| 400 | Invalid slug | "The shortcode name can only contain letters, numbers, and dashes." |
| 500 | Server error | "Something went wrong saving the prompt. Check Mission Control logs." |
