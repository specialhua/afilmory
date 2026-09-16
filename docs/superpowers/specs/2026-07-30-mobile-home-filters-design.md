# Mobile Home Header — Identity + Filters — Design

**Date:** 2026-07-30
**Scope:** Home overlay upgrade: floating avatar/filter buttons, date pill gains location + filter-summary modes, native formSheet filter panel (web-parity dimensions), profile card sheet. Client-side filtering only — the `photo-masonry` native module is untouched.
**Builds on:** `2026-07-29-mobile-oauth-own-gallery-design.md` and the home native-masonry work (photo-masonry local Expo Module, immersive home, date pill; landed 2026-07-30 via fast-path).

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Top form | Immersive stays; floating glass circle buttons top-right (avatar, filter), date pill top-left |
| Filter dimensions | Web parity: tags (any/all), date range (presets + custom), camera, lens, rating ≥N. No keyword search (no viewer to jump to yet) |
| Filter carrier | Native formSheet via the existing `present()` system, medium/large detents, changes apply live (no Apply button) |
| Active state | Filter button tinted accent + count badge; pill becomes persistent "N photos · summary", tap opens the sheet (Clear all lives inside the sheet) |
| Avatar tap | Profile card sheet: avatar, name, gallery name/slug, photo count, Open gallery on web, Sign out |

## Top overlay

- **Button group** (persistent, `insets.top + 8`, right 12): two 36pt circles, `systemChromeMaterialDark` BlurView + hairline border, matching the pill.
  - Avatar button: `user.image` fill, initial-letter fallback → presents profile sheet.
  - Filter button: SF Symbol `line.3.horizontal.decrease`; active → accent tint + count badge (number of active dimensions).
- **Date pill** modes:
  - No filters: current behavior (fade in past 400pt scroll), label becomes `date range · location` when a location resolves.
  - Filters active: always visible, label `N photos · summary` (e.g. `128 · 2 tags · Fujifilm`), pressable → opens filter sheet.
- Location resolution for the visible range: prefer manifest `location.city` / `locationName`; fall back to the web tag heuristic (tag containing 省/市/区/县/镇/村/街道/路 or a known city name); first hit wins.

## Filter sheet (formSheet, medium + large detents)

Grouped scroll content; every change applies immediately to the masonry behind the sheet. Header shows live result count; footer has Clear all.

1. **Date**: preset chips (Last 7/30/90 days, This month, This year, Last year) + custom from/to via compact native date pickers.
2. **Tags**: wrap-flow multi-select chips + Any/All segmented control (disabled while <2 tags selected).
3. **Camera** / 4. **Lens**: aggregated lists from EXIF (normalized `Make Model` / `LensModel`) with per-item counts.
5. **Rating**: ≥N stars (1–5), from EXIF Rating.

If the current presentation system lacks formSheet/detent support, extend it there (don't fork a new mechanism).

## Filtering pipeline

- `filterStore.ts` — module store (`useSyncExternalStore`, same pattern as `sessionStore`), holds `PhotoFilters` state; reset on sign-out/slug change.
- `applyFilters(photos, filters)` — pure function mirroring the filter subset of web `filterAndSortPhotos` (usePhotoViewer.ts).
- `OwnGalleryView` feeds the filtered array to `PhotoMasonryView`; visible-range/date-pill logic operates on the filtered array. Native module unchanged.

## Data layer additions

`GalleryPhoto` += `tags: string[]`, `camera: string | null` (normalized, dedups Make repeated in Model), `lens: string | null`, `rating: number | null`, `city: string | null`. Mapped in `galleries/api.ts` from manifest fields (`tags`, `exif.Make/Model/LensModel/Rating`, `location`). Aggregations (tag/camera/lens lists with counts) are memoized from the photo array.

## Profile sheet (formSheet, medium)

Large avatar, name, gallery name + slug, photo count; actions: **Open gallery on web** (`https://<slug>.afilmory.art` via `Linking`), **Sign out** (danger, existing `signOut`). Settings account section unchanged.

## Files (`apps/mobile/src/modules/photos/`)

| File | Action |
|---|---|
| `filters/filterTypes.ts` `filters/filterStore.ts` `filters/applyFilters.ts` `filters/aggregates.ts` `filters/locationHint.ts` | new — state, pure filtering, EXIF/tag aggregation, location heuristic |
| `FilterSheet.tsx` + `filterSheetPage.ts` | new — sheet UI |
| `ProfileSheet.tsx` + `profileSheetPage.ts` | new |
| `HomeButtons.tsx` | new — floating avatar/filter buttons |
| `DateRangePill.tsx` | edit — location, filter-summary mode, pressable |
| `OwnGalleryView.tsx` | edit — wire store, filtered array, overlays |
| `../galleries/types.ts` `../galleries/api.ts` | edit — field mapping |
| `../../pages.ts` | edit — register sheets |

## Verification

- `pnpm type-check` + scoped lint.
- Simulator via `axe` + screenshots: open sheet → pick a tag → masonry updates live + badge + pill summary; date presets; clear all; profile sheet actions; location shows in pill when scrolling a located region; signed-out home unaffected.

## Out of scope

- Keyword search, ActiveFiltersHero-style block, sort toggle, URL/state persistence of filters across launches, Android.
