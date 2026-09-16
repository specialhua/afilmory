# Mobile Home Identity + Filters — Execution Plan

Spec: `docs/superpowers/specs/2026-07-30-mobile-home-filters-design.md` (read for context only; each task below is self-contained).

## Global Constraints

- iOS only. Zero Android effort, no `Platform.OS === 'android'` branches. The `photo-masonry` native module (`apps/mobile/modules/photo-masonry/`) must not change.
- Zero comments / zero JSDoc except workaround/invariant notes (per repo CLAUDE.md).
- Dark-only theme: colors via `palette` from `@/theme/useTheme` + tokens from `@/theme/tokens` (`font`, `radius`, `radiusLg`, `controlH`). Overlay glass = `expo-blur` `BlurView` `tint="systemChromeMaterialDark"` + hairline border `rgba(255,255,255,0.12)` (match `src/modules/photos/DateRangePill.tsx`).
- Module stores use the `useSyncExternalStore` pattern of `src/modules/auth/sessionStore.ts` — no zustand/jotai.
- React components < 300 lines/file. English UI copy. Import alias `@/*`.
- After each task: `pnpm --filter @afilmory/mobile type-check` and `npx eslint --fix <changed files>` (never lint the whole repo) must pass. Commit per task, message style `feat(mobile): …`. Never add AI co-authorship.
- All paths below are relative to `apps/mobile/`.

## Task 1: Data layer + pure filter functions

Extend the gallery data mapping and add the pure functions the filter UI will consume. No UI changes.

**1. `src/modules/galleries/types.ts`** — extend `GalleryPhoto`:

```ts
export interface GalleryPhoto {
  id: string
  thumbnailUrl: string
  thumbHash: string | null
  aspectRatio: number
  width: number
  height: number
  dateTaken: string | null
  isLive: boolean
  tags: string[]
  camera: string | null
  lens: string | null
  rating: number | null
  city: string | null
}
```

**2. `src/modules/galleries/api.ts`** — extend `ManifestPhoto` with `tags?: string[]`, `exif?: { Make?: string, Model?: string, LensModel?: string, Rating?: number } | null`, `location?: { city?: string | null, locationName?: string | null } | null`, and map in `fetchGalleryManifest`:
- `tags: photo.tags ?? []`
- `camera`: from `exif.Make`/`exif.Model` — if `Model` already starts with `Make` (case-insensitive, trimmed) use `Model`, else `` `${Make} ${Model}` ``; either alone if only one present; `null` if neither.
- `lens: exif.LensModel ?? null` (trimmed, empty → null)
- `rating`: `exif.Rating` clamped to integer 0–5, else `null`
- `city: location?.city ?? location?.locationName ?? null`

**3. `src/modules/photos/filters/filterTypes.ts`** (new):

```ts
export type DatePreset = 'last7' | 'last30' | 'last90' | 'thisMonth' | 'thisYear' | 'lastYear'
export type TagMode = 'any' | 'all'
export interface PhotoFilters {
  tags: string[]
  tagMode: TagMode
  datePreset: DatePreset | null
  dateFrom: string | null   // 'YYYY-MM-DD'
  dateTo: string | null     // 'YYYY-MM-DD'
  cameras: string[]
  lenses: string[]
  minRating: number | null  // 1-5
}
export const EMPTY_FILTERS: PhotoFilters
export const DATE_PRESET_LABELS: Record<DatePreset, string>
// 'Last 7 days' | 'Last 30 days' | 'Last 90 days' | 'This month' | 'This year' | 'Last year'
export function hasActiveFilters(filters: PhotoFilters): boolean
export function countActiveDimensions(filters: PhotoFilters): number
// dimensions: tags, date (from||to), cameras, lenses, rating — each contributes 1
export function presetRange(preset: DatePreset, now: Date): { from: string, to: string }
export function summarizeFilters(filters: PhotoFilters): string
```

`summarizeFilters` joins parts with `' · '`: tags → the tag itself when 1 selected else `` `${n} tags` ``; cameras → the name when 1 else `` `${n} cameras` ``; lenses → name when 1 else `` `${n} lenses` ``; rating → `` `≥${n}★` ``; date → `DATE_PRESET_LABELS[preset]` when preset set else `'Dates'`.

**4. `src/modules/photos/filters/applyFilters.ts`** (new): `applyFilters(photos: GalleryPhoto[], filters: PhotoFilters): GalleryPhoto[]` — returns the same array reference when nothing is active. Semantics per dimension (a dimension only filters when active):
- tags: `any` → photo has ≥1 selected tag; `all` → photo has every selected tag
- date: compare `photo.dateTaken.slice(0, 10)` (ISO) against `dateFrom`/`dateTo` inclusive; photos with null `dateTaken` are excluded while a date filter is active
- cameras / lenses: membership of `photo.camera` / `photo.lens`; null excluded while active
- rating: `photo.rating != null && photo.rating >= minRating`

**5. `src/modules/photos/filters/aggregates.ts`** (new): `buildFilterOptions(photos)` → `{ tags, cameras, lenses: Array<{ value: string, count: number }>, ratedCount: number }`, each list sorted by count desc then value asc.

**6. `src/modules/photos/filters/locationHint.ts`** (new): `cityForRange(photos: GalleryPhoto[], startIndex: number, endIndex: number): string | null` — clamp range; first non-null `photo.city` wins; else first tag containing any of `省 市 区 县 镇 村 街道 路 北京 上海 广州 深圳 杭州 南京 成都`; else null.

Verification: type-check + scoped lint. Pure functions must be import-cycle-free (no React imports).

## Task 2: Presentation system — native sheet detents

Extend `src/presentation/` so a page can request a true native form sheet with detents (half-height, draggable) instead of the RN `Modal` path. Read `src/presentation/page.tsx`, `PresentationHost.tsx`, `presentationStore.ts` first.

- Add optional `detents?: number[]` (fractions, e.g. `[0.5, 1]`) to `PagePresentation`.
- In `PresentationHost`, when a session's presentation has `detents` (iOS), render it via `react-native-screens` primitives (`ScreenStack` + `ScreenStackItem` with `stackPresentation="formSheet"`, `sheetAllowedDetents`, `sheetGrabberVisible`, `sheetCornerRadius`, `onDismissed` → existing dismiss action) instead of RN `Modal`. Inspect `react-native-screens` (v4.26) exported types in `node_modules` for exact prop names; the app already depends on it.
- The Modal path and all existing pages (`signIn`, `galleries`, …) must behave exactly as before; `detents` is opt-in.
- Background behind the sheet must stay interactive-looking (standard formSheet dimming is fine); sheet content gets `palette.bgSurface`-style background and inherits the session's `headerShown` handling.
- If `ScreenStackItem` proves unusable outside a navigation container, report BLOCKED with what you tried — do not fall back to a JS-drawer imitation.

Verification: type-check + scoped lint + `pnpm --filter @afilmory/mobile bundle` (export must succeed). Behavior is exercised by Task 3.

## Task 3: Filter store, sheet, and home wiring

The integration task: filter state, the filter sheet page, the floating filter button, pill filter mode, and the filtered pipeline into the masonry. Builds on Task 1 functions and Task 2 detents.

**1. `src/modules/photos/filters/filterStore.ts`** (new, `sessionStore.ts` pattern): state `PhotoFilters` (init `EMPTY_FILTERS`); actions `toggleTag(tag)`, `setTagMode(mode)`, `setDatePreset(preset | null)` (computes `presetRange(preset, new Date())` into from/to; null clears all three), `setCustomRange(from, to)` (sets from/to, clears `datePreset`), `toggleCamera(name)`, `toggleLens(name)`, `setMinRating(n | null)`, `clearFilters()`; hook `useFilters()`.

**2. `src/modules/photos/homeFeedStore.ts`** (new, same pattern): `{ slug: string | null, photos: GalleryPhoto[] }`, `setHomeFeed(slug, photos)`, `useHomeFeed()`. `OwnGalleryView` publishes after each successful load/refresh; publishing a different slug also calls `clearFilters()`.

**3. `src/modules/photos/FilterSheet.tsx` + `filterSheetPage.ts`** (new): `definePage` id `filterSheet`, title `Filters`, presentation `{ style: 'formSheet', detents: [0.5, 1] }`. Register as `filterSheet` in `src/pages.ts`. Content (ScrollView, groups in spec order; reads `useHomeFeed()` photos, `buildFilterOptions` memo, `useFilters()`):
- Header row (below the system grabber): live result count `` `${applyFilters(photos, filters).length} of ${photos.length}` `` + `Clear all` text button (danger color, only when `hasActiveFilters`).
- **Date**: preset chips (6 presets; selected = accent fill) + two `expo-symbols`-free custom rows: `From` / `To` using `@react-native-community/datetimepicker` compact style (add the dependency via `npx expo install @react-native-community/datetimepicker`); picking either clears the preset highlight via `setCustomRange`.
- **Tags**: wrap-flow chips (value + count, selected = accent) + `Any / All` two-segment control, disabled until ≥2 tags selected.
- **Camera** and **Lens**: rows with name + count + checkmark (SymbolView `checkmark`) toggling membership. Hide a group entirely when it has no options.
- **Rating**: five star buttons; tapping star N sets `minRating = N`, tapping the active N again clears to null. Hidden when `ratedCount === 0`.
- Every control mutates `filterStore` immediately — no Apply button.

**4. Home overlay (`src/modules/photos/`)**: new `HomeButtons.tsx` — for now a single 36pt glass circle top-right (`insets.top + 8`, right 12): SymbolView `line.3.horizontal.decrease` (15pt, white); when `hasActiveFilters` → icon `palette.accent` and a small accent badge (16pt circle, white 10pt count of `countActiveDimensions`) at the button's top-right; press → `present(Pages.filterSheet)`. (Task 4 adds the avatar circle to this component.)

**5. `DateRangePill.tsx`** (edit): props become `{ label: string | null, visible: boolean, onPress?: () => void }`; when `onPress` present wrap in `Pressable` (`accessibilityRole="button"`, hitSlop 8).

**6. `OwnGalleryView.tsx`** (edit): `filtered = useMemo(applyFilters(photos, filters))` feeds the masonry `photos` prop and all range math. Pill logic:
- filters active → `visible` always true, `label = `${filtered.length} · ${summarizeFilters(filters)}``, `onPress` opens the filter sheet
- no filters → current scroll-threshold behavior; label = date range plus `` ` · ${city}` `` when `cityForRange(filtered, start, end)` resolves
- filters active and `filtered.length === 0` → keep overlays, replace the masonry area with the existing centered-state styling: `No photos match the filters` + a `Clear filters` accent button calling `clearFilters()`.
- Publish `setHomeFeed(slug, photos)` after loads; render `HomeButtons` above the scrim.

Verification: type-check + scoped lint. Note in the report anything about `datetimepicker` config-plugin/prebuild needs.

## Task 4: Profile sheet + avatar button

- **`src/modules/photos/ProfileSheet.tsx` + `profileSheetPage.ts`** (new): `definePage` id `profile`, title empty (`headerShown: false` if supported by the page config), presentation `{ style: 'formSheet', detents: [0.5] }`; register as `profile` in `src/pages.ts`. Content, top to bottom, centered: 64pt avatar (`session.user.image`, initial fallback — mirror `SettingsScreen.tsx` avatar pattern), user name (17pt/600), `` `${tenant.name} · ${tenant.slug}` `` secondary line, `` `${photos.length} photos` `` from `useHomeFeed()` muted line, then two `controlH` rows (bgElement, radiusLg, hairline border): `Open gallery on web` → `Linking.openURL('https://<slug>.' + SAAS_BASE_DOMAIN)` (import `SAAS_BASE_DOMAIN` from `@/api/client`), and `Sign out` (danger text) → existing sign-out from `@/modules/auth/sessionStore` then dismiss the sheet.
- **`HomeButtons.tsx`** (edit): add the avatar circle (user image fill / initial fallback) left of the filter button, gap 10, press → `present(Pages.profile)`. Read avatar from `useAuth()`.
- Sheet must handle a missing tenant defensively (render nothing / dismiss) — it is only reachable signed-in.

Verification: type-check + scoped lint.
