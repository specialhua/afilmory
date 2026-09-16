# Mobile App Skeleton (`apps/mobile`) — Design

**Date:** 2026-07-29
**Scope:** New Expo React Native app at `apps/mobile` (`@afilmory/mobile`). Skeleton only — architecture, routing, theme system, and API foundation. No business screens.
**Reference:** The mobile app in `newsliquid` (Expo SDK 57 + expo-router + NativeTabs, plain `StyleSheet` + palette theme, `definePage`/`present` presentation layer). This spec ports that skeleton and aligns naming with afilmory conventions.

## Goals

1. A bootable empty-shell app: three native tabs, dark/light theme, typed routes.
2. All structural infrastructure in place so future screens only add files under `modules/`: route shells, presentation (modal) engine, theme tokens, API client.
3. Zero-friction monorepo integration: no Metro/Babel config, pnpm isolated linking, catalog-pinned TS/React types.

## Non-Goals

- No gallery, photo viewer, auth flow, or any real API calls.
- No state library (add jotai per-feature when the first stateful module lands).
- No test runner (add vitest when the first pure model appears).
- No EAS / release configuration.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Data source | afilmory backend API (`be/apps/core`), consumed via in-app client |
| Init scope | Pure skeleton |
| Styling | No styling library — `createStyles(palette)` + `StyleSheet.create` |
| Structure | Full newsliquid skeleton incl. presentation layer; `modules/` naming (not `features/`) |
| Bundle ID | `app.afilmory` (iOS bundleIdentifier and Android package) |

## Workspace Integration

- Location `apps/mobile`, package `@afilmory/mobile`. Already matched by the `apps/**/*` workspace glob — `pnpm-workspace.yaml` unchanged.
- Keep pnpm **isolated** linking. Do not add `node-linker=hoisted`; Expo SDK 57 + Metro handle pnpm symlinks. Newsliquid verified this setup.
- Root `package.json` gains `"dev:mobile": "pnpm --filter @afilmory/mobile start"`.
- `typescript` and `@types/react` resolve via `catalog:`.
- No workspace package dependencies initially. `@afilmory/sdk`/`@afilmory/typing` can be added later — they are source-only TS packages, which Metro transpiles through the symlink (the newsliquid `packages/api` pattern). If shared code is imported later, always use subpath imports, never barrels.

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK ~57 (managed + CNG; `ios/`, `android/` gitignored, `expo run:*` prebuilds) |
| Router | `expo-router` with typed routes; `expo-router/unstable-native-tabs` (`NativeTabs`) for the tab bar |
| React / RN / TS | React 19.2.x · react-native 0.86.x · TypeScript `catalog:` |
| Styling | None. `createStyles(palette)` factories, `StyleSheet.hairlineWidth` for hairlines |
| State | None yet |
| Images | `expo-image` (installed now; the entire app is images) |
| Lists | `@shopify/flash-list` |
| HTTP | `ofetch` |
| Storage | `expo-secure-store` (installed, plugin registered; not wired yet) |
| Gestures / animation | `react-native-gesture-handler`, `react-native-reanimated` |
| Support | `react-native-safe-area-context`, `react-native-screens`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-linking`, `expo-constants` |

Pin `@babel/core` ^7.x in mobile `devDependencies` so a future Babel 8 elsewhere in the workspace cannot win module resolution (newsliquid lesson).

## Directory Layout

```
apps/mobile/
├── app.json                 # static Expo config
├── package.json
├── tsconfig.json
├── .env.example             # EXPO_PUBLIC_API_URL=
├── .gitignore               # ios/, android/, .expo/, .env*
├── assets/                  # icon / splash placeholders
└── src/
    ├── app/                 # expo-router routes ONLY — 1–8 line files, zero logic
    │   ├── _layout.tsx      # GestureHandlerRootView > SafeAreaProvider > theme
    │   │                    #   bridge > <Slot/> + <PresentationHost/>
    │   ├── index.tsx        # <Redirect href="/photos" />
    │   └── (tabs)/
    │       ├── _layout.tsx  # NativeTabs: photos / explore / settings
    │       ├── photos/{_layout,index}.tsx     # index: export default photosPage.Route
    │       ├── explore/{_layout,index}.tsx    # placeholder pair
    │       └── settings/{_layout,index}.tsx   # placeholder pair
    ├── modules/             # real screens + logic, one folder per domain
    │   ├── photos/          # PhotosScreen.tsx (placeholder content) + photosPage.ts
    │   ├── placeholder/     # PlaceholderTabLayout.tsx, PlaceholderTabScreen.tsx
    │   └── shell/           # AppHeader.tsx
    ├── presentation/        # definePage / present / PresentationHost / presentationStore
    ├── api/                 # client.ts (ofetch), auth.ts (sync token singleton)
    ├── theme/               # palette.ts, tokens.ts, useTheme.ts
    ├── ui/                  # shared primitives (empty initially)
    └── pages.ts             # central PageDefinition registry
```

Conventions (ported from newsliquid, enforced going forward):

- Route files under `src/app` are thin shells: a `PageDefinition.Route` re-export or a 1-line wrapper. All logic lives in `modules/`.
- Every tab owns a nested Stack via its own `_layout.tsx`.
- Naming: `PascalCase.tsx` components, `camelCase.ts` logic, `useX.ts` hooks, `xPage.ts` page definitions, colocated `*.test.ts`.
- Imports alias-first (`@/theme/useTheme`); intra-module imports relative.
- Layer split inside a module as it grows: pure model → transport → orchestration hook → screen → page definition.

## Theme System

Three files, no CSS, no Tailwind. Colors are TS objects consumed only through `useTheme()`.

- **`theme/palette.ts`** — `Palette` interface + `dark`/`light` values.
  - Gray ramp: Apple UIKit system colors (`#1c1c1e / #2c2c2e / #3a3a3c / #48484a`, systemGray ramp, UIKit `separator` rgba values), matching the `tailwindcss-uikit-colors` values used by `apps/web`.
  - Accent: `#007bff` from `config.json` `accentColor`, hardcoded in the skeleton (wire to site config later if needed). Same value in both modes — it is effectively Apple systemBlue, which Apple ships on white as-is; `accentDim` / `accentLine` are rgba derivatives per mode.
  - Token names: `bgCanvas / bgSurface / bgElement / bgHover`, `border / borderStrong`, `textPrimary / textSecondary / textMuted`, `accent / accentHi / accentDim / accentLine / accentContrast`.
- **`theme/tokens.ts`** — colorless tokens: `font` (Platform.select System/Menlo), `fontSize`, `radius`, `radiusPill`, `controlH: 44`, `tabularNums`.
- **`theme/useTheme.ts`** — `useColorScheme() !== 'light'` (default-to-dark bias), returns `{ palette, isDark }`. No manual toggle, no persistence; driven by `userInterfaceStyle: "automatic"`.

Consumption rule: screens never import palette values directly. `const { palette } = useTheme()` + `const styles = useMemo(() => createStyles(palette), [palette])`, with `createStyles` defined at file bottom. The root layout bridges the palette into React Navigation's theme object once, and `(tabs)/_layout.tsx` feeds `iconColor`/`tintColor` on `NativeTabs`.

## Routing & Presentation Layer

- Tabs: `photos` (redirect target from `/`), `explore`, `settings`. SF Symbols on iOS + Material icons on Android via `NativeTabs.Trigger`.
- `photos` exercises the full chain: `modules/photos/PhotosScreen.tsx` (placeholder content on `bgCanvas`) + `photosPage.ts` via `definePage` → route file `export default photosPage.Route`.
- `explore` / `settings` use the `modules/placeholder` pair.
- Port `src/presentation/` from newsliquid intact: `definePage<TParams, TResult>` returns `{ Component, id, title, presentation, Route }`; `present(page, params)` returns `Promise<{status:'completed';value} | {status:'cancelled'}>`; `usePageRuntime()` exposes `{ params, finish, cancel, present, source }` identically for route and modal lives; `presentationStore` is a module-level external store read via `useSyncExternalStore`; `<PresentationHost/>` renders RN `<Modal>` sessions at the root. The future photo viewer is a heavy modal consumer — this lands now.
- `src/pages.ts` exports the `Pages` registry (starts with `photos` only).

## API Foundation

- **`api/auth.ts`** — module-level token singleton: `setAuthToken` / `getAuthToken` / `subscribeAuthToken`. Interface stays **synchronous** — `getAuthToken()` runs inside the request path. SecureStore hydration happens later in an auth module, before data screens mount.
- **`api/client.ts`** — one `ofetch` instance. `baseURL` from `process.env.EXPO_PUBLIC_API_URL`; attaches `Authorization` when a token is set. No endpoints, no services yet — those grow as `modules/<domain>/api.ts` files against this client.

## Config Files

- **`app.json`** — name `Afilmory`, slug `afilmory`, scheme `afilmory`, `userInterfaceStyle: "automatic"`, `backgroundColor: "#000000"`, iOS `bundleIdentifier: "app.afilmory"` (`supportsTablet: false` initially), Android `package: "app.afilmory"`, plugins `expo-router` / `expo-splash-screen` (black, small icon) / `expo-secure-store`, `experiments: { typedRoutes: true, reactCompiler: true }`.
- **No `app.config.ts`** yet — add the dynamic-overlay pattern only when env-dependent plugin config appears.
- **No `metro.config.js`, no `babel.config.js`** — Expo ≥52 auto-configures monorepos; the old `watchFolders` recipe is actively wrong.
- **`tsconfig.json`** — `extends: "expo/tsconfig.base"`, `strict: true`, paths `@/*` → `./src/*`; includes `.expo/types` and `expo-env.d.ts`.
- **Root `eslint.config.mjs`** — add a mobile section: allow default exports / non-component exports in `apps/mobile/src/app/**` (expo-router requires them); ignore `apps/mobile/{ios,android}/**`.
- **`.env.example`** — `EXPO_PUBLIC_API_URL=`.

## Verification

1. `pnpm install` succeeds from repo root with no workspace fallout.
2. `pnpm --filter @afilmory/mobile type-check` passes (script name matches repo convention).
3. ESLint passes on all new files.
4. `pnpm --filter @afilmory/mobile bundle` (`expo export --platform ios --output-dir .expo/export-check`) — bundle health check passes.
5. Manual: `expo run:ios` boots to the three-tab shell, tabs switch, dark/light follows system. (User-verified on simulator/device.)

## Out of Scope / Next Steps

1. Photos waterfall feed against the backend manifest API (first real module).
2. Auth module: sign-in against Better Auth on `be`, SecureStore hydration.
3. Photo viewer as a `present()` modal.
4. Extract API layer to a workspace package when a second consumer appears.
