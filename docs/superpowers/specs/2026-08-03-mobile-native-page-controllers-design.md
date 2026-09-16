# Native Page Controllers — Design

**Date:** 2026-08-03
**Scope:** Take the four photo-surface pages native — Photos, Explore, Map and Studio library — and finish removing React from the consumer surface. Second and final spec of the mobile native migration.
**Preceded by:** `2026-08-03-mobile-native-data-and-detail-design.md` — the data layer, localization, session and detail page that this spec's controllers consume.
**Touches:** `apps/mobile/modules/photo-masonry/ios/{Pages,Sidebar,Map,Upload,Tests}/**`, `apps/mobile/src/app/(tabs)/**`, and the deletions listed under [Deletions](#deletions).

> Both specs are implemented as one continuous effort. There is no runnable intermediate state between them: the data spec leaves the native layer built and fixture-green but unwired, and the app runs again only when this spec's controllers land with it.

## Context

The data spec moves every photo data source into Swift and deletes the React detail page. What it leaves behind is chrome: four React components that no longer own any data but still draw the loading spinner, the error state, the date pill, the profile button, the filter entry point, the upload FAB and Studio's selection toolbar. They cannot keep working — the state they render now lives in Swift, and bridging it back is exactly the traffic both specs remove.

Total surface: **1,377 lines across 8 files.**

| Page | Files | Lines |
|---|---|---|
| Photos tab | `PhotosHomeScreen.tsx`, `OwnGalleryView.tsx`, `sidebar/PhotoSidebarAccessory.tsx`, `sidebar/sidebarModel.ts` | 113 + 316 + 147 + 105 |
| Explore | `GalleriesScreen.tsx`, `GalleryCard.tsx`, `GalleryDetailScreen.tsx`, `GalleryMasonry.tsx` | 141 + 230 + 29 + 110 |
| Map | `PhotoMapScreen.tsx` | 161 |
| Studio library | `StudioLibraryScreen.tsx` | 299 |

Much of this is thinner than it looks: the heavy native pieces already exist.

## Goals

1. The four pages render entirely from Swift. React hosts them and nothing more.
2. No React step precedes any native page render — the ordering invariants the data spec removed stay removed.
3. Behavior is unchanged. Still a port, not a redesign.

## Non-goals

- The React sign-in flow, including `ShowcaseMasonry`. It has its own endpoint (`fetchGalleryPreviewPhotos`), no filtering and no detail navigation, so it creates no dual source of truth.
- Studio's other screens — comments, operations, analytics, site.
- The tab bar. `(tabs)/_layout.tsx` already uses `NativeTabs`, which is a real `UITabBarController`; only tab *content* changes.
- Dev screens, except the one call that sets the API environment.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Explore galleries list | Native, including the card UI |
| Studio library | Fully native — selection, tag editing, bulk mutations, upload entry |
| Page hosting | Real child view controllers via containment; Swift never touches the RNScreens screen |
| Gallery detail navigation | Native push on the page's own `UINavigationController` |
| Photo detail navigation | Modal custom presentation (see the transition spec) |
| Tab container | Unchanged (`NativeTabs`) |
| Sign-in | Stays in React |

## Mounting and navigation

Each tab's React screen degrades to a host that adopts a native view controller once through containment:

```tsx
export default function PhotosTab() {
  return <NativePhotosHomeView style={StyleSheet.absoluteFill} />
}
```

The native side of that view is not a bare `UIView` — it owns a real `UIViewController`, added via `addChild` / `didMove(toParent:)`. See `2026-08-03-photo-transition-native-rebuild-design.md` for why hosting works this way and what it unlocks; the short version is that a real view controller can present its own modals, own its own navigation controller, and answer status-bar and rotation callbacks without Swift ever inspecting the RNScreens screen.

Second-level navigation splits by kind:

- **Explore list → gallery detail** is a native push on the page's own `UINavigationController` — hierarchical, nav bar, system-standard animation.
- **Any masonry → photo detail** is a modal custom presentation, because the presenter must stay live and stationary underneath. The transition spec covers it.

React's router stops tracking these pages. That costs nothing measurable: there are no universal links, no `associatedDomains` entry, and no `Linking` call anywhere in `src/`. The `afilmory` scheme exists for the OAuth callback, which belongs to the sign-in flow and stays in React.

## Controllers

| Controller | Replaces | Responsibilities |
|---|---|---|
| `PhotosHomeController` | `PhotosHomeScreen`, `OwnGalleryView`, `PhotoSidebarAccessory`, `sidebarModel` | Home feed resolution, load/error/empty states, date pill, profile button, filter entry, pull-to-refresh, column preference, iPad sidebar |
| `GalleriesController` | `GalleriesScreen`, `GalleryCard` | Featured gallery list; cover art, ThumbHash placeholder, card layout |
| `GalleryDetailController` | `GalleryDetailScreen`, `GalleryMasonry` | Unfiltered gallery masonry with its own load/error states |
| `PhotoMapController` | `PhotoMapScreen` | Map chrome, error and signed-out states, filter interplay |
| `StudioLibraryController` | `StudioLibraryScreen` | Selection mode, tag editing, bulk mutations, upload entry, queue surface |

### Already native, to be wired rather than written

`PhotoSidebarModule`, `PhotoFilterSheetView`, `ProfileSheetView`, `UploadFabView`, `UploadReviewSheetView`, `UploadQueueSheetView`, `PhotoMapView`, `pickNativePhotos`, `ThumbHash.swift`.

So the real work is controller logic plus Explore's card UI. The sheet layer is mostly wiring.

### Studio specifics

Studio reads the **raw** admin asset, not the normalized `GalleryPhoto`: `availableTags` walks `asset.manifest.data.tags`, and `commonTags(selectedAssets)` drives the tag editor. `PhotoFeedStore`'s studio feed must therefore retain the raw asset alongside the normalized photo rather than discarding it after decoding.

`Alert.prompt` for tag editing becomes `UIAlertController` with a text field. Bulk mutations (`updatePhotoAssetTags` and its siblings) move onto `AfilmoryAPI`. The upload flow already delegates to native pickers and sheets; only its orchestration loop moves.

### Sheet presentation simplifies

`SheetPromiseSession` exists to make native sheets awaitable from JavaScript. Once the pages are native, sheets are presented directly in Swift and the promise plumbing is dead for these call sites. `PhotoSheetsModule` shrinks to whatever React still needs — which, after this spec, is nothing on the photo surfaces. Delete the entries that no longer have a caller rather than leaving an unused module surface.

### The environment setter

The data spec makes native own the API environment override. The React dev screen keeps its UI and calls a native setter to change it. This is the only remaining React → native state write in the app.

## What React keeps

Bootstrap (`_layout.tsx`, `(tabs)/_layout.tsx`, `index.tsx`), the auth module including sign-in and `ShowcaseMasonry`, Studio's non-library screens, `presentation/`, and the dev screens.

`_layout.tsx` keeps `GestureHandlerRootView`, `SafeAreaProvider`, the i18n provider and `PresentationHost`. Its `environmentReady` gate is no longer load-bearing for native pages — they resolve the environment themselves — but it still gates React's own screens and stays.

## Deletions

**Pages:** `PhotosHomeScreen.tsx`, `OwnGalleryView.tsx`, `sidebar/PhotoSidebarAccessory.tsx`, `sidebar/sidebarModel.ts`, `GalleriesScreen.tsx`, `GalleryCard.tsx`, `GalleryDetailScreen.tsx`, `GalleryMasonry.tsx`, `PhotoMapScreen.tsx`, `StudioLibraryScreen.tsx`.

**Logic:** `photos/filters/*` (the store already went with the data spec), `photos/{dateRange,profileStats,columnPreference,homeFeedStore}.ts`, `galleries/{types,videoSource,photoMasonryItem,thumbhash,useFeaturedGalleries}.ts`, `photo-viewer/usePhotoContextMenu.ts`.

**Tests:** every `.test.mjs` covering the above — `sidebarModel`, `dateRange`, `profileStats`, `photoMasonryItem`, `videoSource`, and the filter tests. Their cases are ported to XCTest, not dropped.

**Kept, trimmed:** `galleries/api.ts` shrinks to `fetchFeaturedGalleries` and `fetchGalleryPreviewPhotos`; `galleries/types.ts` keeps `GalleryCoverPhoto`. Both serve the sign-in showcase.

**Studio is partial-file surgery, not file deletion.** `studio/api.ts` and `studio/format.ts` are shared with Studio screens that stay in React, so only the library page's share moves:

| Symbol | Only consumer | Outcome |
|---|---|---|
| `listPhotoAssets`, `getPhotoAssetSummary`, `updatePhotoAssetTags` | `StudioLibraryScreen` | Move to Swift; delete from `studio/api.ts` |
| `photoAssetToGalleryPhoto`, `parseTags` | `StudioLibraryScreen` | Move to Swift; delete from `studio/format.ts` |
| `formatBytes`, `formatCount`, `formatDateTime`, `formatTrendMonth`, `collectSettingFields` | Home, Analytics, Operations, Comments, Site | **Keep** — those screens stay in React |

`studio/format.test.mjs` follows the same split: the `photoAssetToGalleryPhoto` and `parseTags` cases port to XCTest, the rest of the file stays.

> `fetchFeaturedGalleries` ends up with two implementations — Swift for the Explore list, TypeScript for the sign-in showcase. That is accepted: the showcase is decorative, pre-auth, and reads a different shape (`GalleryCoverPhoto`). Rewriting the sign-in screen to remove the duplication costs more than the duplication does.

## Testing

Controller work is UI work, so golden fixtures do not apply the way they do to the data spec. Verification splits three ways.

**Pure logic → XCTest.** `sidebarModel.ts` has 89 lines of existing tests; `dateRange` and `profileStats` have their own. These translate directly and are the only parts of this spec with meaningful branch logic.

**Rendered output → simulator.** Each page gets a scripted pass: launch, screenshot, exercise the interactive chrome (filter sheet, date pill, profile, refresh, selection mode, tag edit, upload), screenshot again. Drive taps with `axe` HID injection and capture with `xcrun simctl io … screenshot`, per the repo's simulator-automation convention.

**Regression targets worth naming explicitly**, because they are easy to lose in a port and invisible in a screenshot diff:

- iPad sidebar trailing inset — `(tabs)/_layout.tsx` currently threads `onContentLayoutChange` into `contentStyle` padding. Native ownership must preserve it, and it only reproduces on iPad.
- Pull-to-refresh keeping the previous photos on failure (`useGalleryManifest.refresh` swallows errors deliberately).
- Column preference persisting across relaunch.
- `minimizeBehavior` switching to `never` on the Studio tab.

## Risk register

| Risk | Mitigation |
|---|---|
| Silent loss of small behaviors during a large UI port | The named regression list above, exercised on the simulator rather than assumed |
| iPad-only sidebar regressions going unnoticed | Explicit iPad simulator pass; do not verify on iPhone alone |
| Studio bulk mutations losing their raw-asset dependency | Studio feed retains raw assets alongside normalized photos, stated in the data spec's decoding contract |
| `SheetPromiseSession` left half-dead | Delete call-site-less entries in the same change rather than leaving an unused surface |
| Explore card UI drifting from the React original | Screenshot comparison against the pre-migration build, captured before deletion |
| Large non-runnable window across both specs | Native layer stays compilable and fixture-green; controllers land in one wiring pass |

## Expected end state

React retains bootstrap, auth, Studio's non-library screens, presentation and dev tooling. Every photo surface — masonry, detail, map, gallery browse, library management — is Swift, reads one data source, and opens the detail page inside a single main-thread call.
