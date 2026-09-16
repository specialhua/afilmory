# Native Photo Data Layer and Detail Page — Design

**Date:** 2026-08-03
**Scope:** Move every photo data source (manifest fetch, normalization, filtering), the API environment, the auth session and the entire photo detail page from JavaScript into Swift. Phase A of a two-spec migration that ends with the mobile consumer surface running natively.
**Touches:** `apps/mobile/modules/photo-masonry/ios/{Localization,Data,Filters,Models,Session,Detail,Masonry,Sheets,Tests}/**`, `apps/mobile/modules/photo-masonry/ios/PhotoMasonry.podspec`, `apps/mobile/scripts/generate-native-fixtures.mjs`, and the deletions listed under [Deletions](#deletions) — most of `apps/mobile/src/modules/photo-viewer/` (`usePhotoContextMenu.ts` stays), plus the `useGalleryManifest` call sites in `galleries/` and `photos/`.
**Followed by:** `2026-08-03-mobile-native-page-controllers-design.md` — the page chrome that still renders in React after this spec lands.

> **Phases are documentation boundaries, not shipping boundaries.** Both specs are designed up front and implemented as one continuous effort. There is deliberately no runnable intermediate state between them and no transitional bridge code: the native layer is built and proven green against golden fixtures while unwired, then wired in and the React implementation deleted in one pass.

## Problem

Tapping a photo in the masonry takes 320–392 ms to start the opening animation, and the whole screen is frozen for that entire window.

The freeze is deliberate: `PhotoTransitionRegistry` snapshots the host window at touch-up and pins the bitmap over everything (`PhotoTransitionRegistry.swift:10-38`) so React's route push cannot flash an intermediate frame. The side effect is that every millisecond spent afterwards reads as an unresponsive screen — no press feedback survives, nothing moves.

Measured breakdown on an iPhone 17 Pro simulator, 188-photo gallery, two samples:

| Stage | run 2 | run 1 |
|---|---|---|
| `didSelectItemAt` | 0 | 0 |
| Window snapshot done | +12.7 (12.5 ms) | +13.1 (12.9 ms) |
| Native event dispatched | +13.1 | +13.3 |
| JS receives event | +14.1 | +16.8 |
| `router.push` returns | +14.1 | +17.8 |
| React starts rendering detail | +24.1 | +34.8 |
| `photos` array built | +29.1 | +40.8 |
| **`metadataJSON` built** | **+264.1 (235 ms)** | **+290.8 (250 ms)** |
| Native view created | +280.6 | +331.1 |
| Props applied | +295.7 | +373.5 |
| **Opening animation starts** | **+320.1** | **+392.5** |

The dominant cost was `PhotoDetailScreen`'s `metadataJSON` memo building a full info payload for all 188 photos on first render and serializing 614 KB of JSON, when the open only needs one photo. That has been fixed separately by narrowing the first commit to a ±2 window and deferring the rest past the animation — measured 320–392 ms → **69.8 ms**.

What remains is structural. Of the 69.8 ms, only 11.5 ms is the native snapshot; the other ~58 ms is a round trip through JavaScript that exists purely because JS owns the data:

| Segment | Cost |
|---|---|
| Window snapshot (native) | 11.5 ms |
| Bridge hop native → JS | 1.1 ms |
| `router.push` → React render | 11.0 ms |
| JS builds photos + metadata window | 9.0 ms |
| React commit → Fabric mount | 14.6 ms |
| Prop application (native) | 9.7 ms |
| Layout + `main.async` → animation | 12.9 ms |

**The bridge itself is not the bottleneck — it costs 1.1 ms.** The cost is the round trip: React render, Fabric commit, prop serialization, and the runloop hops around them. Removing it means the data must live where the view lives.

## Goals

1. Native owns the photo data source. JavaScript holds no photo data after this phase.
2. The photo detail page is presented from `didSelectItemAt` inside a single main-thread call — no JS involvement in the open path.
3. Behavior is unchanged. This is a port, not a redesign.

## Non-goals

- Page chrome — loading/error/empty states, date pill, profile button, filter entry points, upload FAB, Studio selection mode, Map chrome — belongs to the controllers spec, not this one.
- The React sign-in flow stays in React. Native owns the session it produces, not the flow that produces it.
- No new features on any page.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Refactor driver | Architecture first; latency is a by-product |
| Masonry surfaces in scope | All three — Photos tab, Explore gallery detail, Studio library |
| Map tab | Fully native; its chrome lands in the controllers spec |
| Swift i18n | Bundle the existing JSON catalogs, look them up in Swift |
| Filter state owner | Swift, from this spec onward |
| Studio data source | Ported here, not special-cased |
| API environment owner | Swift, owning its own keychain key rather than reading Expo's |
| Auth session owner | Swift fetches it; React keeps only the sign-in flow |
| Transitional bridges | None — both specs are designed up front and implemented continuously |
| Equivalence proof | Golden fixtures generated from the current JS implementation, plus translated unit tests |

### Why the data layer and the detail page cannot be split

A JavaScript detail page and a native data source are incompatible. `useOpenPhotoViewer(filtered, slug)` builds its session from the **filtered** array, which is what the pager swipes through. Once Swift owns filtering, JS no longer holds that array, and the only way to keep the JS detail page working is to ship the whole filtered list back across the bridge on every tap — the exact traffic this design removes. So the two move together.

The reverse ordering fails for the same reason: a native detail page pushed from a JS-fed masonry would need EXIF for the info sheet, which means fattening the masonry props with per-photo EXIF and deleting it again one phase later.

## Architecture

Four layers, separated so the risky parts are pure and testable.

```
Localization/   Localization.swift, LanguageTag.swift, PluralRule.swift
Session/        ApiEnvironment.swift, AfilmorySession.swift  (extends AfilmorySessionStore)
Data/           GalleryPhoto.swift, PhotoFeedKey.swift, PhotoFeedStore.swift,
                ManifestDecoding.swift, StudioAssetDecoding.swift
Filters/        PhotoFilterEngine.swift, PhotoFilterStore.swift
Models/         PhotoHeaderModel.swift, PhotoInfoModel.swift, PhotoInfoFormatters.swift,
                PhotoInfoGear.swift, DateRange.swift, ProfileStats.swift,
                PhotoReactionState.swift, PhotoReactionTally.swift, PhotoCommentCount.swift
Tests/          + Fixtures/
```

All of it goes into the existing `photo-masonry` local Expo module. The podspec glob `**/*.{h,m,mm,swift}` is recursive, so subdirectories are free. **Adding `.swift` files requires `pod install`** — add this whole batch in one pass rather than incrementally.

### Localization

`locales/{app,mobile}/*.json` are flat dotted-key catalogs with `{{var}}` interpolation and `_one`/`_other` plurals. Language comes from the device only — `src/i18n/index.ts:59` uses `detectDeviceLanguage()`, there is no in-app language setting and no runtime switching. So Swift reads `Locale.preferredLanguages.first` through a direct port of `resolveLanguageTag` (`src/i18n/index.ts:30-52`) and never synchronizes with JS.

**Delivery.** A ~15-line Node script copies `locales/{app,mobile}/*.json` into `modules/photo-masonry/ios/Resources/Locales/` before prebuild; the podspec declares `s.resource_bundles = { 'AfilmoryLocales' => ['Resources/Locales/*.json'] }`. The copy target is gitignored. CocoaPods handles resource paths outside the pod root badly, which is why the repo-root `locales/` directory is not referenced directly. `source_files` only matches `*.{h,m,mm,swift}`, so the JSON is not picked up as source.

**Lookup.** Lazily load two catalogs — the resolved language and `en` as fallback — merging app then mobile, in that order, so mobile wins. This must match `src/i18n/index.ts:22` (`{ ...appEn, ...mobileEn }`). Each catalog is ~30 KB; parsing is sub-millisecond and happens once.

```swift
Localization.t("photo.info")
Localization.t("accessibility.profile", ["name": userName])
Localization.t("filter.summary.cameras", count: n)
```

**Plural rule — a behavior that must be copied, not invented.** Every locale file carries both `_one` and `_other` (13 pairs in mobile, 2 in app), but i18next selects via `Intl.PluralRules`. Under CLDR, Chinese, Japanese and Korean have only an `other` category, so **`count == 1` selects `_other` in zh-CN/zh-HK/zh-TW/jp/ko and `_one` only in en**. A naive "count == 1 → `_one`" implementation silently diverges in five of six languages.

### Data

`GalleryPhoto` is the single domain model. Both sources normalize into it:

- `ManifestDecoding` — `GET {galleryOrigin}/api/manifest`, port of `fetchGalleryManifest` (`src/modules/galleries/api.ts:85`): drop entries without `thumbnailUrl`, sort by `dateTaken` descending, then map with defaults and derive `camera`, `lens`, `aspectRatio` and live-photo state.
- `StudioAssetDecoding` — the admin path, port of `listPhotoAssets()` and `getPhotoAssetSummary()` from `src/modules/studio/api.ts` plus `photoAssetToGalleryPhoto` from `src/modules/studio/format.ts`. Both files are shared with Studio screens that stay in React, so this is partial-file surgery — see the controllers spec for the exact symbol split.

**The studio feed keeps its raw assets.** Studio's management UI reads fields that normalization discards — `availableTags` walks `asset.manifest.data.tags`, and the tag editor computes `commonTags` over selected raw assets. So the studio bucket stores the decoded `GalleryPhoto` *and* the originating asset, rather than throwing the asset away after mapping. The controllers spec depends on this.

**Sort stability.** `Array.prototype.sort` has been stable since ES2019; Swift's `sort(by:)` is not. Photos sharing a `dateTaken` — or both missing one — would land in a different order, which is directly visible in the masonry. Sort explicitly by `(dateTaken descending, original index ascending)`.

**String comparison.** JS uses `localeCompare` on ISO date strings, which coincides with ordinal comparison. The golden fixture proves this rather than assuming it.

`PhotoFeedStore.shared` buckets by `PhotoFeedKey` (`.manifest(slug)` / `.studioLibrary`) and vends an `@Observable PhotoFeed` holding `photos`, `loadState` and `lastError`. Networking reuses the existing `AfilmoryAPI` + `APIEndpoint`; no new HTTP layer. Concurrent loads for one key are de-duplicated in flight, which is equivalent to the current `AbortController` cancellation.

`PhotoFeed` exposes both `@Observable` (for the SwiftUI sheets) and an explicit `observe { } -> Token` callback (for UIKit). UIKit is the primary consumer here, and an explicit registry is more predictable than re-arming `withObservationTracking`.

### Environment and session ownership

Native cannot start fetching on someone else's schedule, so both prerequisites move with the data.

**Environment.** Today native learns the API base URLs only when JS calls `registerEnvironment` (`src/native/afilmorySession.ts:23` → `AfilmorySessionModule.swift:11`), and the root layout gates every request behind `waitForEnvironment()` (`src/app/_layout.tsx:24-29`) because a fetch that starts earlier hits the production default. That ordering currently holds by accident — a native masonry view cannot exist before `environmentReady` flips (`_layout.tsx:50`). The moment `PhotoFeedStore` issues its own requests the accident becomes load-bearing, so ownership moves instead of being documented around: **the environment override becomes native state**, read and written by `AfilmorySessionStore` against the keychain, with the React dev screen calling a native setter to change it.

Native deliberately does **not** parse `expo-secure-store`'s existing keychain layout. Owning the key outright avoids a needless compatibility coupling to Expo's storage schema, and the setting is dev-only, so changing owners costs no migration.

**Session.** The native detail page needs the viewer's identity for comments and the sign-in prompt — `PhotoDetailScreen` currently forwards `auth.session?.user.id` into `presentNativePhotoComments`. So `AfilmorySessionStore` grows from a cookie holder into a session holder: it fetches the session itself using the cookie it already reads from the keychain, porting `modules/auth/api.ts` (53 lines) and `modules/auth/types.ts` (33 lines).

The sign-in flow stays in React. It still calls `registerSession(cookie)` on success; native reacts by fetching the session. Sign-out goes through native `clearSession`, which the React sign-in page observes.

Net effect: no ordering invariant survives this spec. Native pages depend on nothing that React must do first.

### Filters

`PhotoFilterEngine` is pure: `applyFilters`, `buildFilterOptions`, `countActiveDimensions`, `hasActiveFilters`, `summarizeFilters`, `presetRange`, `cityForRange`. `presetRange` currently reads `new Date()` directly (`filterStore.ts:48,86`); the Swift version takes `now` as a parameter, otherwise date presets are untestable.

`PhotoFilterStore.shared` holds one global `PhotoFilters` value, **in memory only** — the current store does not persist and resets on relaunch. All mutation logic moves to Swift, including the `replaceFilters` branch that recomputes a preset's range against the current time. Nothing in JavaScript reads or writes filters after this spec: the filter entry points move with the page chrome in the follow-up spec, and the two land together.

Filters apply to the home feed alone. Explore's gallery detail does not filter, and Studio has its own selection semantics.

### View contract

`PhotoMasonryView` stops receiving photos and starts naming its source:

| | Before | After |
|---|---|---|
| Photo data | `photos: [MasonryPhoto]` | removed |
| Source | — | `feedKey: String` (`"manifest:<slug>"` / `"studio"`) |
| Filtering | JS pre-filters and passes the result | `appliesFilters: Bool`, true only for the home feed |
| Selection | `selectionMode` / `selectedPhotoIds` | unchanged until the controllers spec |

`PhotoDetailView` loses `metadataJSON`, `stringsJSON`, `livePhotoStringsJSON` and `reactionItemsJSON` entirely — it builds all of that from `GalleryPhoto` and `Localization`. `PhotoSheetsModule.presentPhotoInfo` changes from taking a pre-rendered payload to taking `(photoId, feedKey)`.

The detail page is presented directly from `PhotoMasonryView.didSelectItemAt`.

The window snapshot does **not** survive that change. It exists to stop a React route commit from exposing an intermediate frame; with the detail view controller laid out synchronously before its animation begins, there is no intermediate frame to hide. `2026-08-03-photo-transition-native-rebuild-design.md` rebuilds the transition on standard UIKit machinery and deletes the snapshot, the registry, the fallback timers and the `transitionId` plumbing. It is a **co-requisite of this spec, not a follow-up** — letting `PhotoTransitionRegistry` and `transitionId` land here only to be deleted immediately after would be writing throwaway code.

### No transitional bridges

An earlier draft carried two: a `filterStore.ts` proxy so React chrome could still drive filters, and an `onFeedStateChange` event so React could still render loading and error states. Both are gone.

They only bought a runnable state *between* this spec and the controllers spec, and there is no such state — the two are implemented as one continuous effort. Keeping them would mean writing a proxy and an event contract in order to delete them a few days later, and the intermediate state they enable is not where equivalence bugs surface anyway; the golden fixtures are.

The consequence to plan around: this spec's changes do not produce a working app on their own. The native layer is built and proven green while unwired, and the app only runs again once the controllers spec's work lands with it.

## Testing

Behavior equivalence is the whole point, so the proof is a golden-fixture corpus generated from the implementation being replaced, backed by translated unit tests for edge cases fixtures cannot cover.

**Generator:** `apps/mobile/scripts/generate-native-fixtures.mjs`, re-runnable, output committed to `Tests/Fixtures/`:

| Fixture | Contents |
|---|---|
| `manifest.json` | 188 real photos, including Fuji recipes, GPS, and missing-field cases |
| `studio-assets.json` | Raw admin asset payload |
| `expected-normalized.json` | `ManifestDecoding` output, order included |
| `expected-header-{locale}.json` | 6 locales × 188 title/subtitle pairs |
| `expected-info-{locale}.json` | 6 locales × 188 full info models |
| `expected-filters.json` | Filter combinations → matching id lists |

**Hard ordering constraint: fixtures must be generated and committed before any JavaScript implementation is deleted.** Once the JS is gone there is no source for the expected values. The implementation plan must place fixture generation ahead of every deletion step.

**XCTest** (the podspec already declares `test_spec 'Tests'`):

- `ManifestDecodingTests`, `StudioAssetDecodingTests` — field-by-field and order assertions against the fixtures
- `PhotoHeaderModelTests`, `PhotoInfoModelTests` — 6 locales × 188 rows compared against expected output
- `PhotoFilterEngineTests` — existing edge cases from `applyFilters` plus fixture combinations, with an injected fixed `now`
- `LocalizationTests` — interpolation, missing-key fallback to `en`, app/mobile merge order, and the plural assertion: `accessibility.filtersActive` at `count: 1` in zh-CN must resolve to `_other`
- `DateRangeTests`, `ProfileStatsTests`, `PhotoReactionTallyTests` — translated from the existing `.test.mjs` cases

**Second portability risk to watch.** `PhotoHeaderModel` formats with `Intl.DateTimeFormat` at `dateStyle: 'medium'` and `timeStyle: 'short'`. Swift's `Date.FormatStyle` runs against a different ICU version than Hermes and may produce different strings, most likely in Chinese, Japanese and Korean. The golden fixtures are what surface this; where they diverge, align the Swift side explicitly rather than accepting the platform default.

## Deletions

Removed in this phase:

`PhotoDetailScreen.tsx`, `photoDetailPage.ts`, `photoInfoModel.ts`, `photoInfoFormatters.ts`, `photoInfoGear.ts`, `photoHeaderModel.ts`, `photoReactionState.ts`, `photoReactionTally.ts`, `photoReactionApi.ts`, `usePhotoReactions.ts`, `usePhotoCommentCount.ts`, `useOpenPhotoViewer.ts`, `photo-viewer/sessionStore.ts`, `src/app/photo/[photoId].tsx`, all `useGalleryManifest` call sites, and `filters/filterControls.tsx` — 213 lines with no remaining references, already dead.

Deleting the `/photo/[photoId]` route costs no deep-link capability: `parseRouteParams` requires a `session` param, and session ids are process-local (`photo-viewer-N` from an in-memory `Map`), so a cold-start deep link to that route already fails today.

Also removed here, since nothing in React reads them once the data moves: `photos/filters/filterStore.ts` and `modules/galleries/useGalleryManifest.ts`.

Kept for the controllers spec: the four pages' chrome, `usePhotoContextMenu.ts`, and the React sign-in flow.

## Expected outcome

| | Before | After |
|---|---|---|
| Tap → opening animation | 69.8 ms | one main-thread call (the transition spec removes the 11.5 ms snapshot too) |
| Photo data in JS | one manifest copy per consumer, four consumers | none |
| Filter state | JS, single copy | Swift, single copy |
| Bridge payload on detail open | 614 KB `metadataJSON` (now 10.9 KB windowed) | none |

Behavior differences: none intended. The golden fixtures enforce that claim.

## Risk register

| Risk | Mitigation |
|---|---|
| ICU divergence between Swift and Hermes on dates and numbers | Golden fixtures across 6 locales; align Swift explicitly where they differ |
| Sort stability (JS stable, Swift not) | Explicit `(dateTaken desc, index asc)` ordering |
| Plural rule divergence in zh/jp/ko | CLDR-correct `PluralRule`; asserted in `LocalizationTests` |
| Locale resources missing if the copy script does not run | Wire the copy into the same npm scripts that run prebuild; fail loudly in DEBUG |
| Native fetch racing ahead of a React-supplied environment | Environment ownership moves to native; no React step precedes a native fetch |
| Environment override lost when ownership moves off `expo-secure-store` | Dev-only setting with no migration requirement; native owns the key outright |
| `pod install` churn from incremental file additions | Add all new `.swift` files in one pass |
| Fixtures unobtainable after JS deletion | Generation step ordered before every deletion in the plan |
| No runnable app between the two specs | Accepted deliberately; the native layer stays compilable and fixture-green throughout, and both specs are planned before implementation starts |

## What comes next

`2026-08-03-mobile-native-page-controllers-design.md` takes the four pages' chrome native — Photos, Explore, Map and Studio library — and finishes the React cleanup. It is designed before implementation of either spec begins.
