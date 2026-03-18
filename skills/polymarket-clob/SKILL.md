---
name: polymarket-clob
description: Polymarket CLOB API geoblock fix — route order placement through a proxy when US IPs are blocked
version: 1.0.0
metadata:
  openclaw:
    requires:
      env: []
    primaryEnv: POLYMARKET_PROXY_URL
---
# Polymarket CLOB API — Geoblock Fix

This environment runs on US-based infrastructure (Railway). Polymarket blocks order placement from US IPs — `POST /order` returns HTTP 403 "Trading restricted in your region".

This skill tells you how to handle that situation.

## When this skill applies

Use this skill whenever you:
- Interact with the Polymarket CLOB API (`clob.polymarket.com`)
- See a 403 "Trading restricted in your region" error
- Write code that calls `clob.polymarket.com`
- Use any Polymarket trading tool or skill

## Proxy routing

Check whether `POLYMARKET_PROXY_URL` is set in the environment:

```bash
echo $POLYMARKET_PROXY_URL
```

### If `POLYMARKET_PROXY_URL` is set

Route all CLOB requests through the proxy instead of calling `clob.polymarket.com` directly.

Replace the base URL:
- **Direct (blocked):** `https://clob.polymarket.com`
- **Via proxy:** `$POLYMARKET_PROXY_URL` (e.g. `https://your-proxy.example.com/polymarket-clob`)

Example — place an order via proxy:
```bash
curl -s -X POST "$POLYMARKET_PROXY_URL/order" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLYMARKET_API_KEY" \
  -d '{ ... order payload ... }'
```

All other CLOB endpoints (GET /markets, GET /book, etc.) can still be called directly — only write operations (POST /order, DELETE /order) are blocked.

### If `POLYMARKET_PROXY_URL` is NOT set

**Do not attempt to place orders.** Tell the user:

> "Order placement is blocked from this server's IP region (US). To enable trading, set the `POLYMARKET_PROXY_URL` environment variable to point to a non-US proxy that forwards requests to `clob.polymarket.com`. Read-only operations (fetching markets, order books, positions) still work."

Do not retry the blocked request. Do not suggest VPN workarounds that require manual user action during the conversation.

## Read-only operations (always allowed)

These endpoints are NOT geoblocked and can be called directly:

| Endpoint | Description |
|----------|-------------|
| `GET /markets` | List all markets |
| `GET /markets/{condition_id}` | Get a specific market |
| `GET /book?token_id=...` | Order book for a token |
| `GET /last-trade-price?token_id=...` | Last trade price |
| `GET /positions?user=...` | User positions |
| `GET /orders?user=...` | Open orders |

## Environment variables

| Variable | Description |
|----------|-------------|
| `POLYMARKET_PROXY_URL` | Base URL of a non-US proxy for CLOB write operations. If unset, order placement is disabled. |
| `POLYMARKET_API_KEY` | Polymarket API key for authenticated requests |
| `POLYMARKET_SECRET` | Polymarket API secret |
| `POLYMARKET_PASSPHRASE` | Polymarket API passphrase |

## Error reference

| HTTP | Message | Meaning |
|------|---------|---------|
| 403 | Trading restricted in your region | US IP geoblock — use proxy or inform user |
| 401 | Unauthorized | Missing or invalid API credentials |
| 400 | Bad Request | Malformed order payload |

## Important notes

- **Never** expose API credentials in responses or logs.
- Read-only market data fetching is always safe to do directly.
- If the proxy returns a non-2xx response, surface the error to the user — do not silently retry.
- The proxy must forward the original `Authorization` header and request body unchanged.
