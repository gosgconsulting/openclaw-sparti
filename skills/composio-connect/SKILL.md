---
name: composio-connect
description: Connect any integration via Composio — OAuth redirect link or direct API-key setup — directly from the bot
version: 1.1.0
metadata:
  openclaw:
    requires:
      env: [SETUP_PASSWORD]
    primaryEnv: SETUP_PASSWORD
---
# Composio Connect

You can connect any integration through Composio directly from chat. Two flows are supported:

1. **OAuth flow** — for apps like GitHub, Slack, Google, Notion, Linear, etc. You generate a short-lived redirect link and send it to the user.
2. **API-key flow** — for apps that use API keys, Bearer tokens, or Basic auth (SendGrid, Perplexity, Tavily, PostHog, etc.). The user provides their key and you connect it immediately — no redirect needed.

---

## When to use this skill

Use this skill when the user asks to:
- "Connect Slack with Composio"
- "Connect my GitHub account"
- "Get a magic link to connect [any app]"
- "Link my [app] via Composio"
- "Connect [app] using my API key"
- "Set up [app] integration"
- "Add my [app] credentials to Composio"

---

## Auth type reference

| App | toolkitKey | Auth type |
|-----|-----------|-----------|
| GitHub | `github` | OAuth |
| Slack | `slack` | OAuth |
| Google / Gmail / Drive / Calendar | `googleworkspace` | OAuth |
| Notion | `notion` | OAuth |
| Linear | `linear` | OAuth |
| Jira | `jira` | OAuth |
| HubSpot | `hubspot` | OAuth |
| Salesforce | `salesforce` | OAuth |
| Airtable | `airtable` | OAuth |
| Asana | `asana` | OAuth |
| Trello | `trello` | OAuth |
| Discord | `discord` | OAuth |
| Twitter / X | `twitter` | OAuth |
| LinkedIn | `linkedin` | OAuth |
| Dropbox | `dropbox` | OAuth |
| Zoom | `zoom` | OAuth |
| Figma | `figma` | OAuth |
| SendGrid | `sendgrid` | API_KEY |
| Perplexity AI | `perplexityai` | API_KEY |
| Tavily | `tavily` | API_KEY |
| PostHog | `posthog` | API_KEY |
| Resend | `resend` | API_KEY |
| Brevo | `brevo` | API_KEY |
| Mailgun | `mailgun` | API_KEY |
| Stripe | `stripe` | API_KEY |
| Twilio | `twilio` | API_KEY |
| OpenAI | `openai` | API_KEY |
| Anthropic | `anthropic` | API_KEY |
| Pinecone | `pinecone` | API_KEY |
| Serper | `serper` | API_KEY |
| Browserless | `browserless` | BEARER_TOKEN |

If the user names an app not in this list, ask them whether it uses OAuth or an API key, then use the appropriate flow.

---

## Flow 1 — OAuth (redirect link)

Call the connect-link endpoint:

```bash
curl -s -X POST http://127.0.0.1:${PORT:-8080}/api/composio/connect-link \
  -H "Authorization: Bearer $SETUP_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"toolkitKey": "slack"}'
```

Response:
```json
{ "redirectUrl": "https://connect.composio.dev/link/ln_abc123" }
```

Send the `redirectUrl` to the user. Example reply:
> Here's your Slack connect link — click it to authorize Composio access to your Slack workspace:
> https://connect.composio.dev/link/ln_abc123
>
> The link is single-use and expires if you close it without completing the authorization.

---

## Flow 2 — API key / Bearer token / Basic auth (immediate)

When the user provides their API key directly, call the connect-api-key endpoint:

```bash
curl -s -X POST http://127.0.0.1:${PORT:-8080}/api/composio/connect-api-key \
  -H "Authorization: Bearer $SETUP_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "toolkitKey": "sendgrid",
    "authScheme": "API_KEY",
    "credentials": { "api_key": "SG.xxxx" }
  }'
```

For Bearer token services:
```bash
-d '{
  "toolkitKey": "browserless",
  "authScheme": "BEARER_TOKEN",
  "credentials": { "token": "bless_xxxx" }
}'
```

For Basic auth services:
```bash
-d '{
  "toolkitKey": "someservice",
  "authScheme": "BASIC",
  "credentials": { "username": "user@example.com", "password": "pass" }
}'
```

Response on success:
```json
{ "ok": true, "connectedAccountId": "ca_xxxx" }
```

The connection is **immediately active** — no redirect needed. Reply to the user:
> ✓ SendGrid connected successfully via Composio. Your API key is stored and the integration is ready to use.

---

## Step-by-step decision logic

1. Identify the app from the user's message.
2. Look up the `toolkitKey` and auth type in the table above.
3. If **OAuth**: use Flow 1 (generate and send a redirect link).
4. If **API_KEY / BEARER_TOKEN / BASIC**:
   - If the user already provided their key in the message → use Flow 2 immediately.
   - If not → ask the user for their API key, then use Flow 2.
5. Confirm success or relay the error message.

---

## Error handling

| HTTP status | Meaning | What to tell the user |
|-------------|---------|----------------------|
| 401 | SETUP_PASSWORD wrong or missing | "The server is not configured to manage integrations. Ask the admin to check SETUP_PASSWORD." |
| 400 | Missing toolkitKey or credentials | Internal error — check your request. |
| 503 | COMPOSIO_API_KEY not set | "Composio is not configured on this server. Ask the admin to set COMPOSIO_API_KEY in Railway." |
| 502 | Composio API error | Tell the user the error message from the response body. |

---

## Important notes

- **Never** expose `SETUP_PASSWORD` or any user API key to the user in chat.
- OAuth links are **single-use and short-lived** — generate a fresh one each time.
- API-key connections are **immediately active** — no redirect needed.
- After OAuth completion, Composio redirects the user to the dashboard callback. The connection becomes active automatically.
