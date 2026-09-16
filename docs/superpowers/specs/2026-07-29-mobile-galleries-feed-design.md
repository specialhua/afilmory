# Mobile Galleries Feed (Home Tab) — Design

**Date:** 2026-07-29
**Scope:** First real data screen in `apps/mobile`: replace the Photos placeholder tab with a "Galleries" discovery feed backed by the production SaaS API, mirroring the landing page's registered-galleries list.
**Builds on:** `2026-07-29-mobile-app-skeleton-design.md`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| API base | Hardcoded `https://api.afilmory.art/api` (no env) |
| Entry point | Home tab renamed Photos → Galleries; `/` redirects to `/galleries` |
| Card covers | Yes — 3 latest thumbnails per gallery via the tenant search endpoint |

## Data Layer (verified against production)

- `GET /featured-galleries` → `{ galleries: FeaturedGallery[] }` (top 20 by quality score). Fields: `id, name, slug, domain, description, author{name,avatar}, photoCount, tags, createdAt, lastUpload`. No auth, no tenant.
- Covers: `POST https://<slug>.afilmory.art/api/manifest/photos/search` with `{ limit: 3, sort: 'desc' }` → `{ data: ManifestPhoto[] }` with `thumbnailUrl`, `thumbHash` (hex), `width/height`. Full-manifest download rejected as too heavy. Custom domains (`gallery.domain`) return 403 on `/api` — covers always use the SaaS subdomain.
- Cover results cached in a module-level Map keyed by slug; in-flight requests deduplicated. Fetch is lazy — triggered on card mount, so FlashList's windowing naturally limits concurrency.

## Module Structure

```
src/modules/galleries/
├── types.ts                  # FeaturedGallery, GalleryCoverPhoto
├── api.ts                    # fetchFeaturedGalleries, fetchGalleryCovers + cover cache
├── thumbhash.ts              # hex → base64 (expo-image thumbhash placeholder format)
├── useFeaturedGalleries.ts   # loading / refreshing / error / data + retry
├── GalleriesScreen.tsx       # AppHeader + FlashList + pull-to-refresh + empty states
├── GalleryCard.tsx           # cover collage + author/name/description/tags/count
└── galleriesPage.ts          # definePage
```

Route changes: `(tabs)/photos/**` → `(tabs)/galleries/**`, tab trigger renamed (label "Galleries", SF `photo.stack`), root redirect updated, `modules/photos` deleted, `pages.ts` registry updated. `.env.example` removed (no env vars remain).

## Card UI

- Cover collage, fixed height: 1 large image left (~2/3 width), 2 stacked right. `expo-image` with `thumbHash` placeholder (manifest hex converted to the base64 form expo-image expects), `bgElement` fallback while loading / when a gallery has fewer than 3 covers.
- Info row: circular author avatar (expo-image), gallery name (primary), description (single line, truncated).
- Meta row: `N photos` + up to 3 tag chips (`bgElement` pills, `textSecondary`).
- Shell: `bgSurface`, hairline `border`, `radiusLg` corners, `borderCurve: 'continuous'`. No press handler yet — gallery detail navigation is a later milestone.

## States

- Initial load: centered `ActivityIndicator`.
- Error: message + Retry pressable.
- Refresh: `RefreshControl` wired to the hook's `refresh()`.
- Hook is hand-rolled (useState/useEffect + AbortController), consistent with the skeleton's no-state-library stance.

## Verification

`type-check`, scoped lint, `bundle` export, then live run on the simulator: real production data renders, covers load with thumbhash placeholders, pull-to-refresh works, dark/light both correct.

## Out of Scope

- Tapping into a gallery (per-tenant photo feed) — next milestone.
- Pagination (API returns a fixed top-20).
- Auth.
