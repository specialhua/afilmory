# Local Docker Dev Environment for the Mobile App — Design

**Date:** 2026-08-01
**Scope:** Replace "point the mobile app at production" with a self-contained local stack. Adds `docker-compose.dev.yml` (RustFS), a `seed:dev` CLI command, and an environment-switch surface in the app's Dev Lab. Touches the mobile API layer, `apps/mobile/src/modules/dev-lab/**`, `apps/mobile/app.json`, and `be/apps/core/src/cli/**`.
**Non-goals:** Android, production deployment changes, backend feature work.

## Why this shape

The backend already contains a first-class `*.localhost` dev topology. It was never wired up end to end, but every piece is present:

| Piece | Location | Behavior |
|---|---|---|
| Base domain in dev | `tenant-context-resolver.service.ts:160` | `NODE_ENV=development` → `'localhost'` |
| Slug extraction | `tenant-host.utils.ts` | dedicated `.localhost` suffix branch, strips port first |
| Cookie scope | `auth-cookie.policy.spec.ts` | every localhost host receives a host-only Cookie with no `Domain` attribute |
| Trusted origins | `auth.provider.ts:138-146` | non-production hardcodes `http://*.localhost:*`, `http://localhost:*`, `afilmory://` |
| Cross-host callback | `auth.provider.ts:199` | `skipStateCookieCheck: true` |
| Reserved slugs | `packages/utils/src/tenant.ts:9` | `api` is reserved → `api.localhost` resolves to no tenant, same as production |

So the design is mostly *configuration and seeding*, not new backend code.

Two facts make the heavier alternatives unnecessary:

- **OAuth needs no public exposure.** In the authorization-code flow the provider issues a 302 that the *device's browser* follows. GitHub and Google never connect inbound. A callback on `localhost` is the documented exemption to Google's public-TLD rule.
- **`*.localhost` resolves natively on macOS.** Verified: `getaddrinfo('alpha.localhost')` → `127.0.0.1` / `::1`, zero configuration, offline-safe, wildcard.

Alternatives considered and rejected: Cloudflare Tunnel exposing the whole stack (needs Advanced Certificate Manager for a second-level wildcard — Universal SSL covers only one level — plus public round-trips per image); `/etc/hosts` + mkcert on `*.afilmory.test` (Google rejects non-public TLDs; no wildcard; root-cert install); a real dev domain with a DNS-only wildcard `A` record to `127.0.0.1` (works, but buys nothing over `*.localhost` once the OAuth constraint dissolves).

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Scope | Offline-self-sufficient stack, with real third-party OAuth |
| Object storage | RustFS (`rustfs/rustfs`), S3-compatible, in Docker |
| `core` runtime | Host process (`pnpm dev:be`), not containerized |
| Domain / TLS | `*.localhost` over plain HTTP — no tunnel, no proxy, no certs, no domain |
| OAuth | Existing dev-only client, callback `http://localhost:1841/api/auth/callback/github` |
| Content seed | Real upload pipeline, in-process via the same service the HTTP endpoint calls |
| App switch | Dev Lab page (`__DEV__`-gated), persisted |

## Topology

```
iOS Simulator
  ├─ http://localhost:1841/api             platform API (auth, workspaces)
  ├─ http://<slug>.localhost:1841/api      tenant API (photos, comments, reactions)
  └─ http://localhost:9300/...             direct object URLs

Host process
  └─ pnpm dev:be                            core, :1841, hot reload

docker-compose.yml        db / redis        :5432 / :6379
docker-compose.dev.yml    rustfs/rustfs     :9300 (S3) / :9301 (console)
```

No reverse proxy, no `oauth-gateway` process, no TLS.

`core` stays on the host because `sharp`, `pg-native`, and `exiftool` are platform-native: a container would need its own `node_modules` (anonymous volume over a pnpm workspace with hard links), rebuild native modules on first boot, and expose an inspector port for debugging. Docker holds only stateful services.

**RustFS runs on a named volume, not a bind mount** — the image runs as UID/GID `10001`, and a bind-mounted host directory would need matching ownership.

### URL mapping

| Purpose | Local | Production |
|---|---|---|
| Platform API | `http://localhost:1841/api` | `https://api.afilmory.art/api` |
| Tenant API | `http://<slug>.localhost:1841/api` | `https://<slug>.afilmory.art/api` |
| OAuth callback | `http://localhost:1841/api/auth/callback/{provider}` | `https://auth.afilmory.art/api/auth/callback/{provider}` |
| Object storage | `http://localhost:9300` | S3 / R2 |

The platform API uses bare `localhost` rather than `api.localhost` so the sign-in origin and the OAuth callback origin are byte-identical, removing one cross-origin variable from the login hop. Both hosts resolve to no tenant (`localhost` equals the base domain; `api` is a reserved slug), so they are functionally equivalent.

### Why the gateway is absent

`buildGatewayRedirectUri` (`auth.provider.ts:130-133`) is plain concatenation, so setting the `oauthGatewayUrl` system setting to `http://localhost:1841` produces exactly the registered callback. `core` then handles `/api/auth/callback/{provider}` itself. Sign-in is a platform-level (global identity) operation with no tenant in play, so the gateway's only job — restoring a tenant slug across a subdomain hop — has nothing to do locally.

Note for anyone later tempted to reintroduce the gateway locally: `AUTH_GATEWAY_BASE_DOMAIN` is validated by `/^[a-z0-9.-]+$/i` (`oauth-gateway/src/config.ts:25`), which forbids a colon. Its 302 target can therefore never carry a port, so a gateway-based local topology would require `core` to be reachable on port 80.

## Components

### 1. `docker-compose.dev.yml` (new, repo root)

**One service, not three.** Postgres and Redis already exist in `docker-compose.yml`; redefining them here is actively dangerous. Compose derives the project name from the directory, so both files resolve to the same project, and reusing the `db` / `redis` service keys silently *recreates* those containers against different volumes — which is exactly what happened the first time this was tried. Adding only the missing service keeps the two files composable and non-destructive.

RustFS:

- image `rustfs/rustfs:latest`, published on `9300:9000` and `9301:9001` (the conventional 9000/9001 were already taken on the development machine; the seed's `--endpoint` default matches)
- `RUSTFS_VOLUMES=/data`, `RUSTFS_ADDRESS=0.0.0.0:9000`, `RUSTFS_CONSOLE_ADDRESS=0.0.0.0:9001`
- `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` default to `rustfsadmin`
- named volume for `/data` — the image runs as UID/GID 10001, so a bind mount would need matching ownership
- healthcheck is `curl -sS`, deliberately **not** `curl -fsS`: an unauthenticated GET on the S3 root answers 403, so `-f` would keep the container permanently unhealthy

Startup is therefore two commands: `docker compose up -d db redis` and `docker compose -f docker-compose.dev.yml up -d`.

**Prerequisite: the system HTTP proxy must bypass `*.localhost`.** The iOS Simulator honours the macOS system proxy. A proxy typically special-cases bare `localhost` but not dotted subdomains of it, so `http://localhost:1841` succeeds while `http://alpha.localhost:1841` is intercepted — observed here as a 503 that never reaches `core`. Add `*.localhost` to the proxy's bypass list (Surge: `skip-proxy`), or the tenant API is unreachable from the app while the platform API looks healthy.

### 2. `seed:dev` (new, `be/apps/core/src/cli/seed-dev.ts`)

Implemented as a **CLI subcommand**, not a standalone script. `src/cli/index.ts` is an existing registry, and `createConfiguredApp()` hands back the DI container — which also means `AppInitializationProvider.onModuleInit` provisions the root tenant, the superadmin, and the initialized flag for free. The seed never has to do that itself.

Run: `pnpm --filter @afilmory/core seed:dev [-- --slug <workspace>]`.

**Global step (always).** Creates the bucket via `@aws-sdk/client-s3` (already a `core` dependency, so no CLI container) with `forcePathStyle`, then sets system setting `oauthGatewayUrl` = `http://localhost:1841`, which `buildGatewayRedirectUri` concatenates into the registered callback.

**Workspace step (`--slug`).** Writes `builder.storage.providers` and `builder.storage.activeProvider` for that workspace: provider `s3`, endpoint `http://localhost:9300`, bucket, region, credentials.

A **public-read bucket policy** is applied alongside bucket creation because development manifests use direct object URLs for originals and thumbnails.

**Photo step (also `--slug`).** Uploads everything in `photos/` (override with `--photos-dir`) through `PhotoAssetService.uploadAssets` — the same call the HTTP endpoint makes, so EXIF, thumbnails, blurhash and Live Photo pairing all run for real. It goes in-process rather than over HTTP because the endpoint is multipart-plus-SSE and needs a session; `HttpContext.run` + `HttpContext.assign({ tenant })` supplies the tenant that `requireTenantContext()` expects, and the size-limit lookup has to sit inside that scope too.

Idempotency is keyed on **basename**, not storage key: a Live Photo's `.mov` is folded into the still's manifest instead of getting its own row, so matching full keys would re-upload every video on a second run. Files over the per-file limit are skipped and named in the summary rather than failing the batch.

`--slug root` is rejected outright: `featured-galleries.service.ts:101` filters the root workspace out of discovery, so photos seeded there never surface in the app.

Storage settings are **tenant-scoped** — `SettingService.resolveTenantId` falls back to `getTenantContext()`, which does not exist in a CLI process. `SettingEntryInput` carries `options.tenantId`, which takes precedence, so the seed passes the tenant id explicitly instead of faking an AsyncLocalStorage context. This also means the workspace must already exist: storage cannot be configured before there is a tenant to configure it for.

Both steps are idempotent — bucket creation falls back to `HeadBucket`, and setting writes are upserts.

**Still out of scope: workspace creation.** `AuthRegistrationService.registerTenant` needs a tenant context and a `Headers` object, so the workspace is created through the normal sign-in flow and `seed:dev --slug <it>` is run afterwards.

**Identity caveat** (open): whether Better Auth links an email/password user to a later GitHub/Google sign-in by email. No `accountLinking` block is configured.

### 3. App: environment module

`apps/mobile/src/api/endpoints.ts` currently hardcodes `API_BASE_URL` and `SAAS_BASE_DOMAIN`, and `getGalleryApiBaseUrl` hardcodes the `https://` scheme. Extract the environment into its own module holding `{ scheme, baseDomain, port }`, from which both the platform base URL and per-tenant base URLs are derived.

Two built-in environments — `production` (`https`, `afilmory.art`, no port) and `local` (`http`, `localhost`, `1841`) — plus a custom entry.

Persistence is **async** (`getItemAsync` / `setItemAsync`). The synchronous `getItem` added in expo-secure-store v57 was tried first — it would have let every URL stay a plain constant — but on a simulator build it throws `KeyChainException: A required entitlement isn't present`, which broke every route that transitively imported the module. The async API works fine in the same build, so the sync path is off the table.

That makes hydration a race, handled by removing the race rather than tolerating it:

- `waitForEnvironment()` exposes the hydration promise; `_layout.tsx` renders no `Stack` until it resolves, so nothing can issue a request against a stale default.
- `API_BASE_URL` becomes `getApiBaseUrl()`, and `apiClient` resolves its `baseURL` in `onRequest` like `tenantApiClient` already did.
- `authClient` is built lazily behind `getAuthClient()` — its `baseURL` is only correct after hydration. The type is inferred from the factory, not from `createAuthClient`, or the expo plugin's `getCookie` is lost.

**Changing the environment requires an app reload**, performed via `DevSettings.reload()`. That reload is also what discards the previous environment's session and query caches — a cookie issued for `afilmory.art` is meaningless on `localhost`, and leaving it in place would produce a cascade of 401s instead of a clean signed-out state.

Outside `__DEV__` the persisted value is ignored entirely and production is returned unconditionally.

Three call sites hand-built `https://${slug}.${SAAS_BASE_DOMAIN}` (`galleries/api.ts` ×2, `OwnGalleryView.tsx`); those would ignore the local scheme and port, so they now go through a shared `getGalleryOrigin(slug)` and the `SAAS_BASE_DOMAIN` export is gone.

### 4. App: Dev Lab surface

`app/dev/index.tsx` already exists and redirects away when `!__DEV__`. `DevLabScreen` is currently a single-scenario parameter playground (`registry.ts` holds one entry). Add a section above the scenario list:

- environment selector (production / local / custom) with the resolved platform and tenant URLs displayed
- a reachability probe against the selected platform API so a misconfigured stack fails loudly here rather than as an opaque error on the photos tab
- Apply is disabled until the draft differs from the active environment; applying persists and reloads

It lives in its own file (`ApiEnvironmentSection.tsx`) rather than inside `DevLabScreen`, which is already near the component size limit. Dev-only email/password sign-in was dropped along with content seeding — the registered dev OAuth client covers local sign-in.

### 5. App: ATS

`Info.plist` set `NSAllowsArbitraryLoads=false` with `NSAllowsLocalNetworking=true`, and whether that covers a dotted name like `alpha.localhost` was never established. Rather than leave it to chance, the targeted exception is added up front — it is narrow, and it costs nothing if `NSAllowsLocalNetworking` would have sufficed:

```
NSExceptionDomains → localhost → { NSIncludesSubdomains: true, NSExceptionAllowsInsecureHTTPLoads: true }
```

`app.json`'s `ios.infoPlist` is the committed source of truth — `apps/mobile/ios/` is gitignored prebuild output. The generated `Info.plist` is edited in place too, so the currently checked-out Xcode project picks the exception up without a prebuild.

## Data flow: photo bytes

The manifest contains direct RustFS object URLs. Because both `core` and the Simulator run on the same machine, `http://localhost:9300` is reachable from both sides without host rewriting.

Verified against a running RustFS: path-style create, upload, and GET requests succeed, while virtual-host addressing fails with `NotImplemented: Unknown operation`. The builder's S3 client already uses path-style URLs for a custom endpoint that does not embed the bucket (`packages/builder/src/s3/client.ts:102`).

## Error handling

| Failure | Surfacing |
|---|---|
| Docker services down | `seed:dev` fails on the first S3 or database call with the underlying connection error |
| `--slug` names a workspace that does not exist | Explicit error telling the operator to sign in and create it first |
| Bucket already exists / seed re-run | Idempotent: `HeadBucket` short-circuits creation, setting writes are upserts |
| App pointed at a dead stack | Dev Lab reachability probe reports it in place |
| Stale session after switch | Session and query cache cleared on switch |

## Verification

Static: `pnpm --filter @afilmory/mobile type-check` and `pnpm lint` scoped to changed files.

Behavioral — each of these must be observed running, not inferred:

Done:

1. `docker compose -f docker-compose.dev.yml up -d` → RustFS healthy.
2. RustFS S3 round-trip: bucket create, put, presign, GET → 200. Path-style only.
3. `pnpm --filter @afilmory/core seed:dev -- --slug alpha` → bucket ensured, `oauthGatewayUrl` and workspace storage written; confirmed by querying `system_setting` and `settings`.
4. `pnpm --filter @afilmory/mobile type-check` clean; eslint clean on all changed files; `core` type-check introduces no new errors (8 pre-existing, none in changed files).
5. Host resolution and tenant routing: `getaddrinfo('alpha.localhost')` → `127.0.0.1`; `curl` against `alpha.localhost:1841` and `beta.localhost:1841` → 200, unknown slug → 400.
6. ATS: the exception is present in the built bundle, and the Dev Lab probe against `http://localhost:1841` returns **reachable · HTTP 200** from the Simulator.
7. Environment switch: applying Local reloads the app, `core` then logs `host=localhost` for `/api/auth/session` and `/api/featured-galleries`, and the app shows a clean signed-out state — no stale production session, no 401 cascade.
8. Tenant subdomains from the Simulator: probing `http://alpha.localhost:1841` returns **reachable · HTTP 200** and `core` logs `host=alpha.localhost`. This failed with a 503 that never reached `core` until `*.localhost` was added to the system proxy's bypass list, which is why that prerequisite is called out above.

Blocked on missing data, not on the environment:

9. Image render end to end: `seed:dev --slug beta` on an empty workspace uploaded 8 files into 6 photos with 2 Live Photo pairings, and the app — signed out, on Local — renders Explore → "Alpha Gallery · 6 photos" → a full masonry with Live Photo badges, all served from RustFS.

10. Studio management against Local, signed in as `alice@test.dev` (owner of `alpha`):
    - **Delete → "Delete files too"** removes both the `photo_asset` row and the RustFS object (6 → 5).
    - **Upload** re-adds the same file through the PHPicker and runs the full derive pipeline: `5606×3737`, EXIF `ILCE-7M3`, `dateTaken`, thumbHash, HDR flag, and a thumbnail served from RustFS (200, 172 KB).
    - **Edit tags** rewrites the storage key into a tag path (`DSCF0038.avif` → `local-test/anya/DSCF0038.avif`) and moves the object rather than orphaning it; the grid re-renders from the new URL.

    Reaching this needed two auth fixes, both of which affect production, not just the local stack — see `fix(mobile): persist the auth session across launches`. `@better-auth/expo` filters `Set-Cookie` on a `cookiePrefix` that defaulted to `better-auth` while the server issues the Afilmory-specific session cookie (currently `afilmory-tenant.session_token`), so the session was never stored; and its `getCookie()` reads storage synchronously, which `expo-secure-store` cannot do on Simulator builds, so every relaunch fell back to signed-out.

Blocked on credentials:

11. **GitHub OAuth** — the local database holds `fake-github-client-id`; the real dev client credentials have to be configured first.

## Open items

- Better Auth account-linking default between the seeded email/password user and OAuth identities — Components §2; fallback is the dev-only email/password sign-in.
- Whether `core`'s S3 client sets `forcePathStyle` for custom endpoints, or whether the storage setting must carry it — Verification step 5; fallback is adding the flag to the seeded storage setting.
- Whether ATS blocks `alpha.localhost` — Components §5; fallback is the `NSExceptionDomains` entry given there.

Each is a verification step in the implementation plan, not a design fork — every outcome has a stated fallback.
