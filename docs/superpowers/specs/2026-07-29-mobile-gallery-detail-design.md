# Mobile Gallery Detail (Masonry) — Design

**Date:** 2026-07-29
**Scope:** Tap a gallery card on the Galleries tab → push a per-tenant photo masonry screen. Visuals mirror `apps/web`'s gallery grid.
**Builds on:** `2026-07-29-mobile-galleries-feed-design.md`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Data | Full manifest per tenant (`GET https://<slug>.afilmory.art/api/manifest`), web parity |
| Photo tap | No-op this milestone (viewer modal comes later) |
| Layout | 2-column shortest-column masonry via FlashList `masonry`, matching web |

## Web parity facts (from apps/web exploration)

- Phone width → 2 columns, 4px gutters, 4px outer padding, square corners, tiles are bare images at rest (all overlays are hover-only on web, which does not exist on touch).
- Tile height = columnWidth / `aspectRatio`.
- thumbHash placeholder sits under the image. Backend manifest serves thumbHash as hex → reuse existing `thumbHashHexToBase64`.
- Web chrome: fixed 48px blurred header. Mobile equivalent: native Stack header, `headerTransparent` + dark `headerBlurEffect`, title = gallery name, native back button.
- Sort: `dateTaken` desc (web default).

## Navigation

- `(tabs)/galleries/_layout.tsx`: `Slot` → expo-router `Stack`. `index` keeps no header; `[slug]` uses the transparent blurred native header.
- New route `(tabs)/galleries/[slug].tsx` → `galleryDetailPage.Route`.
- `galleryDetailPage = definePage<FeaturedGallery>` with `parseRouteParams` (newsliquid `newsDetailPage` pattern): the card push serializes the full `FeaturedGallery` as a JSON route param; parse throws on invalid so bad deep links fail loudly.
- `GalleryCard` becomes a `Pressable`; `GalleriesScreen` owns the `router.push`.

## Module Layout (colocated in the galleries domain)

```
src/modules/galleries/
├── api.ts                  # + fetchGalleryManifest(slug)
├── types.ts                # + GalleryPhoto
├── useGalleryManifest.ts   # loading / error / photos
├── GalleryDetailScreen.tsx # FlashList masonry, 2 cols
└── galleryDetailPage.ts    # definePage with parseRouteParams
```

`GalleryPhoto`: `id, thumbnailUrl, thumbHash, aspectRatio, width, height`. Manifest response is mapped down to this immediately — the screen never holds full EXIF payloads.

## Screen

- FlashList `masonry numColumns={2}`, `contentInsetAdjustmentBehavior="automatic"` (content flows under the transparent header).
- Spacing: container horizontal padding 2 + per-tile padding 2 → 4px gaps and 4px outer margin, like web.
- Tile: explicit `height = columnWidth / aspectRatio`, square corners, `bgElement` under-fill, expo-image with thumbhash placeholder, `contentFit="cover"`, `recyclingKey`.
- States: centered spinner / error + retry (same pattern as GalleriesScreen). No pull-to-refresh this round.
- `Stack.Screen options={{ title: gallery.name }}` set from the screen.

## Out of Scope

- Photo viewer, filtering, cameras/lenses facets, pagination.

## Verification

type-check, scoped lint, bundle export; simulator: tap card → detail masonry renders real photos, back returns, dark chrome correct.
