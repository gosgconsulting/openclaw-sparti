---
name: composio-connect
description: Generate and send Composio OAuth Connect Links directly from the bot
version: 1.0.0
metadata:
  openclaw:
    requires:
      env: [SETUP_PASSWORD]
    primaryEnv: SETUP_PASSWORD
---
# Composio Connect Link

You can generate a Composio OAuth Connect Link for any toolkit (Slack, GitHub, Google, etc.) and send it directly to the user in chat — without them needing to open the dashboard.

## When to use this skill

Use this skill when the user asks to:
- "Connect Slack with Composio"
- "Connect my GitHub account"
- "Get a magic link to connect [any app]"
- "Link my [app] via Composio"
- "Connect [app] with a link"

## How to generate the link

Call the wrapper server's connect-link endpoint using the `SETUP_PASSWORD` environment variable as a Bearer token:

```bash
curl -s -X POST http://127.0.0.1:${PORT:-8080}/api/composio/connect-link \
  -H "Authorization: Bearer $SETUP_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"toolkitKey": "slack"}'
```

The response is JSON:
```json
{ "redirectUrl": "https://connect.composio.dev/link/ln_abc123" }
```

Send the `redirectUrl` to the user.

## Toolkit key reference

| App | toolkitKey |
|-----|-----------|
| Slack | `slack` |
| GitHub | `github` |
| Google / Gmail / Drive | `google_super` |
| Notion | `notion` |
| Linear | `linear` |
| Jira | `jira` |
| HubSpot | `hubspot` |
| Salesforce | `salesforce` |
| Airtable | `airtable` |
| Asana | `asana` |
| Trello | `trello` |
| Discord | `discord` |
| Twitter / X | `twitter` |
| LinkedIn | `linkedin` |

If the user names an app not in this list, use the lowercase app name as the toolkit key (e.g. `dropbox`, `zoom`, `figma`).

## Full example

User: "Connect my Slack with Composio"

Steps:
1. Read `SETUP_PASSWORD` and `PORT` from the environment.
2. POST to `http://127.0.0.1:${PORT:-8080}/api/composio/connect-link` with `{ "toolkitKey": "slack" }`.
3. Extract `redirectUrl` from the JSON response.
4. Reply to the user with the link.

Example reply:
> Here's your Slack connect link — click it to authorize Composio access to your Slack workspace:
> https://connect.composio.dev/link/ln_abc123
>
> The link is single-use and expires if you close it without completing the authorization.

## Error handling

| HTTP status | Meaning | What to tell the user |
|-------------|---------|----------------------|
| 401 | SETUP_PASSWORD not set or wrong | "The server is not configured to generate connect links. Ask the admin to check SETUP_PASSWORD." |
| 503 | COMPOSIO_API_KEY not set | "Composio is not configured on this server. Ask the admin to set COMPOSIO_API_KEY in Railway." |
| 502 | Composio API error | Tell the user the error message from the response body. |

## Important notes

- **Never** call this from the browser or expose the `SETUP_PASSWORD` to users.
- The link is **short-lived** — generate a fresh one each time the user asks.
- The link is **single-use** — if the user abandons it, they must ask again.
- After the user clicks the link and completes OAuth, Composio redirects them to the dashboard callback URL. The connection is then active.
