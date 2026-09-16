# OAuth Gateway

Multi-tenant OAuth callback router that lets every identity provider point to a single domain
(`auth.afilmory.art`, for example) while keeping the actual Better Auth handlers inside each tenant
subdomain.

## How It Works

1. Better Auth (running inside `be/apps/core`) wraps the OAuth `state` with the tenant slug.
2. Providers always redirect to the fixed URL `https://auth.afilmory.art/api/auth/callback/{provider}`.
3. For query-based callbacks, the gateway unwraps `state`, restores the inner Better Auth state,
   and issues a 302 redirect to `https://<slug>.afilmory.art/api/auth/callback/{provider}`.
4. For form-post callbacks such as Sign in with Apple on the web, the gateway validates the wrapped
   `state` from the form and issues a 307 redirect so the browser preserves the authorization body.

Because the gateway only rewrites the callback target, it does **not** interact with provider APIs or
tokens.
This keeps configuration simple (single callback URL in GitHub/Google) while ensuring tenant
sessions are still created on the correct host.

## Development

```bash
pnpm --filter @afilmory/oauth-gateway dev
```

The service starts on `http://0.0.0.0:8790` by default.

## Environment Variables

| Variable                          | Default              | Description                                                                             |
| --------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `AUTH_GATEWAY_HOST`               | `0.0.0.0`            | Interface to bind.                                                                      |
| `AUTH_GATEWAY_PORT`               | `8790`               | Port to listen on.                                                                      |
| `AUTH_GATEWAY_BASE_DOMAIN`        | `afilmory.art`       | Root domain used when constructing tenant hosts.                                        |
| `AUTH_GATEWAY_CALLBACK_BASE_PATH` | `/api/auth/callback` | Base path that the providers call.                                                      |
| `AUTH_GATEWAY_FORCE_HTTPS`        | `true`               | Forces redirects to `https` unless the host looks like localhost.                       |
| `AUTH_GATEWAY_ALLOW_CUSTOM_HOST`  | `false`              | Allow requests to pass an explicit `targetHost` query parameter.                        |
| `AUTH_GATEWAY_ROOT_SLUG`          | `root`               | Slug treated as the apex (no subdomain).                                                |
| `AUTH_GATEWAY_STATE_SECRET`       | _none_ (required)    | HMAC secret for decoding wrapped `state` values (fallbacks to `CONFIG_ENCRYPTION_KEY`). |

## Callback Contract

### Query callback

`GET /api/auth/callback/:provider`

Query parameters:

- `state` — wrapped gateway state containing the tenant slug and inner Better Auth state.
- `tenantSlug` (legacy) or `tenant` — optional slug fallback when `state` is not wrapped.
- `targetHost` — explicit host override (opt-in via `ALLOW_CUSTOM_HOST`).
- All other query parameters (`code`, etc.) are forwarded verbatim.

Example redirect produced by the gateway:

```
https://auth.afilmory.art/api/auth/callback/github?code=...&state=<wrapped>
  ⮕ 302 → https://innei.afilmory.art/api/auth/callback/github?code=...&state=<inner>
```

### Form-post callback

`POST /api/auth/callback/:provider`

- Requires `Content-Type: application/x-www-form-urlencoded`.
- Reads and validates the wrapped `state` from the form body to resolve the target tenant.
- Returns a 307 redirect without rewriting the body.
  The browser repeats the original POST against
  Core, whose callback handler unwraps the state and completes the provider exchange.

```text
POST https://auth.afilmory.art/api/auth/callback/apple
  ⮕ 307 → https://innei.afilmory.art/api/auth/callback/apple
```

This service is intentionally stateless so it can be deployed behind a simple load balancer.
