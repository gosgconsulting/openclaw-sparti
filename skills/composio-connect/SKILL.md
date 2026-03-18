---
name: composio-connect
description: Connect any integration via Composio — OAuth redirect link or direct API-key setup — directly from the bot
version: 1.2.0
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
- **"Connect [app] with api: xyz"** or **"Connect productive.io with api: my-key-123"** — user pastes the API key in the same message; connect immediately via Flow 2 (no redirect).
- "Set up [app] integration"
- "Add my [app] credentials to Composio"

---

## Direct API key in message (connect in one step)

When the user sends a **single message** that includes both the app name and the API key, extract both and call the connect-api-key endpoint right away. Do not ask for the key again.

**Message patterns to recognize:**
- "connect [app] with api: [key]"
- "connect [app] with api key [key]"
- "connect [app] api: [key]"
- "link [app] with api: [key]"
- "add [app] api key: [key]"

**Examples:** "connect productive.io with api: xyz", "connect vercel with api key v_abc123", "link ahrefs api: ahrefs_xxx"

**What to do:**
1. Extract the **app name** (e.g. productive.io, vercel, ahrefs) and the **API key** (the part after "api:", "api key", etc.). Do not echo or repeat the key in your reply.
2. Derive **toolkitKey**: If the app is in the auth type table below, use its `toolkitKey`. Otherwise normalize the app name to a slug: lowercase, replace spaces and dots with underscores (e.g. `productive.io` → `productive_io`). Some Composio toolkits drop punctuation (e.g. `productiveio`); if the API returns an error like "toolkit not found", suggest the user check the exact toolkit name in Composio or use the dashboard Connectors list.
3. Call `POST /api/composio/connect-api-key` with:
   - `toolkitKey`: the slug from step 2
   - `credentials`: `{ "api_key": "<extracted key>" }`
   - `authScheme`: `"API_KEY"` (default)
4. On success, reply with a short confirmation **without** repeating the key, e.g. "✓ Productive.io connected. The integration is ready to use."
5. On error (e.g. 502 with "toolkit not found"), tell the user the integration may not be configured in this Composio account and suggest they use the dashboard Connectors tab to see available integrations.

**Security:** Never include the user's API key in your reply. Do not log it or echo it back.

---

## Auth type reference

These are the auth configs configured in the Sparti Composio account (43 total):

| App | toolkitKey | Auth type |
|-----|-----------|-----------|
| GitHub | `github` | OAuth |
| Slack | `slack` | OAuth |
| Gmail | `gmail` | OAuth |
| Google Drive | `googledrive` | OAuth |
| Google Sheets | `googlesheets` | OAuth |
| Google Docs | `googledocs` | OAuth |
| Google Calendar | `googlecalendar` | OAuth |
| Google Slides | `googleslides` | OAuth |
| Google Ads | `googleads` | OAuth |
| Google Analytics | `google_analytics` | OAuth |
| Google Search Console | `google_search_console` | OAuth |
| Google Meet | `googlemeet` | OAuth |
| Notion | `notion` | OAuth |
| HubSpot | `hubspot` | OAuth |
| Salesforce | `salesforce` | OAuth |
| Discord | `discord` | OAuth |
| LinkedIn | `linkedin` | OAuth |
| Instagram | `instagram` | OAuth |
| Facebook | `facebook` | OAuth |
| WhatsApp | `whatsapp` | OAuth |
| YouTube | `youtube` | OAuth |
| Zoom | `zoom` | OAuth |
| Canva | `canva` | OAuth |
| ClickUp | `clickup` | OAuth |
| Asana | `asana` | OAuth |
| Calendly | `calendly` | OAuth |
| Eventbrite | `eventbrite` | OAuth |
| Mailchimp | `mailchimp` | OAuth |
| Monday.com | `monday` | OAuth |
| Trello | `trello` | OAUTH1 |
| Supabase | `supabase` | OAuth |
| HeyGen | `heygen` | API_KEY |
| Cloudflare | `cloudflare` | API_KEY |
| Vercel | `vercel` | API_KEY |
| Make | `make` | API_KEY |
| Apify | `apify` | API_KEY |
| Apollo | `apollo` | API_KEY |
| Ahrefs | `ahrefs` | API_KEY |
| SEMrush | `semrush` | API_KEY |
| Pexels | `pexels` | API_KEY |
| TripAdvisor | `tripadvisor` | API_KEY |
| TripAdvisor Content API | `tripadvisor_content_api` | API_KEY |
| v0 (Vercel) | `v0` | API_KEY |

**Apps not in this list:** Use the normalized app name as toolkitKey (e.g. productive.io → `productive_io` or `productiveio`). If the toolkit is configured in the Composio account, the connection will succeed; otherwise the API returns an error and you can suggest the user check the dashboard Connectors list.

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
2. **If the user included an API key in the message** (e.g. "connect X with api: xyz") → use **Flow 2** immediately. Extract the key, derive toolkitKey (table or normalized slug), call connect-api-key. Do not ask for the key again.
3. Otherwise, look up the `toolkitKey` and auth type in the table above.
4. If **OAuth**: use Flow 1 (generate and send a redirect link).
5. If **API_KEY / BEARER_TOKEN / BASIC** and no key in message: ask the user for their API key, then use Flow 2.
6. Confirm success or relay the error message. Never echo the API key back.

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
