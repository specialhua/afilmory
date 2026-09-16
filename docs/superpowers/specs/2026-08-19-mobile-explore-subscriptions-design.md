# Mobile Explore Subscriptions — Timeline, Following, and Directory Strips

**Date:** 2026-08-19
**Scope:** Turn iOS tab 2 (Explore) into three segments — a journal Timeline of subscribed galleries, a Following list, and the existing directory — and restyle both directory surfaces as title + horizontal recent-photo strips. Adds a provider-side subscription timeline and thickens the existing subscription list. Does not change billing / StoreKit.
**Touches:** `be/apps/core/src/modules/platform/gallery-subscriptions/**`, `be/packages/db` (index on `photo_asset`), `apps/mobile/modules/photo-masonry/ios/Pages/GalleriesController.swift`, `GalleryCardCell.swift`, `GalleryDetailController.swift`, `GallerySubscription.swift`, new store / strip / timeline files beside them.

## Problem

Tab 2 is a discovery directory. Subscribe is a button on a featured card. There is no place to see who you follow, and no place to see what they published. `GET /gallery-subscriptions` returns `{ tenantId, createdAt }` only. Photos still live per tenant; the client already knows how to open one gallery, but nothing assembles “what is new across the galleries I follow.”

The current card (2/3 + 1/3 collage, three covers) is the same shape we would need for Following, which makes a dedicated Following segment look like a filtered Explore.

## Goals

- Signed-in owners of at least one gallery subscription land on a journal Timeline of new photos from those galleries.
- Following is an explicit list of subscribed galleries with recent photos, plus unsubscribe.
- Explore stays the public directory (search + featured), restyled to the same strip language as Following.
- Subscribe / unsubscribe / notification-permission behavior already on Explore is preserved, just moved to the right segment.

## Non-Goals

- Mixed masonry of all subscribed photos (rejected as the Timeline UI).
- A fifth root tab.
- Clustering or sorting by `dateTaken`.
- Infinite Timeline history.
- Folding cover photos into `featured-galleries` to kill the per-slug search.
- Web directory, dashboard, share extension, or Android.
- Changing push copy or APNs payloads.

## Decisions

| Topic | Choice |
| --- | --- |
| Root tabs | Unchanged: Photos / Map / Explore / Studio |
| Segments | `Timeline \| Following \| Explore`, only when signed in |
| Default segment | Signed in and `hasSubscriptions` → Timeline; otherwise Explore |
| Remember last segment | No |
| Directory row | Title + horizontal recent-photo strip (~6), not the collage card |
| Timeline UI | Journal: large date chapters, one post per (gallery, local calendar day) |
| What is a post | Same subscribed gallery, same local calendar day of `syncedAt` |
| Clock | `photo_asset.syncedAt` (entered the library), never `dateTaken` |
| Timezone | Client sends IANA `TimeZone.current.identifier`; server clusters in that zone |
| History window | Photos with `syncedAt` within the last 30 days |
| Photos per Timeline post | Up to 12 in the payload, plus `totalCount` |
| Data | New `GET /gallery-subscriptions/timeline`; thicken `GET /gallery-subscriptions`; Explore keeps `gallery-directory` + cover search |

## Information architecture

`GalleriesController` becomes a container: navigation title remains **Explore**, a `UISegmentedControl` with three segments, and three long-lived children. Switching segments shows/hides children; it does not destroy them.

The signed-out visitor stack stays a single Discover child with no segmented control (today’s `makeVisitorController()`).

Search is installed only while Explore is visible (`navigationItem.searchController`). Timeline and Following have no search. The notification-permission banner stays only on Following, using the same `resolveGalleryNotificationBannerState` rules, keyed off the subscription store’s `hasSubscriptions`.

### Timeline

A list, not a masonry.

- Section by the server’s `event.day`, not by recomputing a date from `latestAt`. Format the header as **Today** / **Yesterday** / a localized date by comparing `event.day` to “today” in the same IANA zone sent on the request.
- Row: avatar, gallery name, time of `latestAt` (that day’s latest photo), one hero (photos[0]), remaining photos as a thumbnail row (photos[1...]).
- Tap the title row → `GalleryDetailController` for that slug, no focused photo.
- Tap the hero or a thumbnail → same controller with `focusPhotoID`.
- Timeline has no subscribe / unsubscribe control.
- Near the bottom, request the next `cursor` page.

### Following

One row per subscription, sorted by `lastUpload` descending (already sorted by the list endpoint).

- Title row: avatar, name, relative `lastUpload` / photo count. Disclosure. No Subscribe button.
- Horizontal strip of up to 6 recent photos from the list payload. No extra per-tenant search.
- Tap title → gallery detail. Tap a strip photo → gallery detail with `focusPhotoID`.
- Unsubscribe: required leading swipe action **Unsubscribe**. Optional long-press context menu with the same action. No confirmation sheet. Failed unsubscribe rolls the row back and shows the existing “Couldn’t update subscription” alert.

### Explore

Same strip row as Following. Data still comes from `gallery-directory` (featured + `q`). Cover photos still come from `POST {slug}/api/manifest/photos/search` with `limit: 6` (today: 3). Subscribe / Subscribed button remains on the title row. Own galleries still hide the button.

## Backend

Both new and thickened routes stay on `GallerySubscriptionController` (`@RequireAuth`, `@SkipTenantGuard`, `@AllowPlaceholderTenant`). Own-gallery and unavailable-gallery rules stay in `evaluateGallerySubscription`; those galleries never appear as list rows or timeline events even if a stale row exists.

### Shared photo preview

```ts
type GalleryPhotoPreview = {
  id: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  isLivePhoto: boolean
  syncedAt: string
}
```

`id` is `photo_asset.photoId`. Skip any asset whose manifest has no usable `thumbnailUrl`. `isLivePhoto` is derived from the same manifest `video` shape the iOS client already normalizes. `syncedAt` is ISO-8601 UTC.

### `GET /gallery-subscriptions`

Replace the current `{ tenantId, createdAt }[]` payload. No compatibility shim (app is unreleased).

```ts
{
  subscriptions: Array<{
    tenantId: string
    createdAt: string
    gallery: {
      id: string
      name: string
      slug: string
      domain: string | null
      author: { name: string, avatar: string | null } | null
      photoCount: number
      lastUpload: string
    }
    recentPhotos: GalleryPhotoPreview[] // max 6, syncedAt desc
  }>
}
```

Eligibility: target tenant is active, not banned, slug not reserved, and the subscriber is not an active member. Sort by `lastUpload` descending. `lastUpload` is `max(syncedAt)` of that tenant’s `synced` / `conflict` photos; if the tenant has no such photos, omit the subscription (a follow with an empty library is not a Following row).

`recentPhotos` is the 6 newest eligible photos by `syncedAt`.

### `GET /gallery-subscriptions/timeline`

Query:

| Param | Rule |
| --- | --- |
| `timeZone` | Required. IANA identifier. Invalid → 400. |
| `limit` | Event count. Default 20, min 1, max 40. |
| `cursor` | Opaque. Absent on the first page. |

Response:

```ts
{
  events: Array<{
    id: string // `${tenantId}:${day}`
    tenantId: string
    day: string // YYYY-MM-DD in `timeZone`
    latestAt: string // ISO UTC, max syncedAt in the event
    gallery: { id, name, slug, author } // same identity fields as the list
    photos: GalleryPhotoPreview[] // syncedAt desc, length <= 12
    totalCount: number // eligible photos that day, after thumbnail filter
  }>
  nextCursor: string | null
}
```

Clustering key: `(tenantId, local-date-of-syncedAt in timeZone)`.
Event order: `latestAt` desc, then `tenantId` asc for a stable tie-break.
Window: only photos with `syncedAt >= now() - 30 days`.
Status filter: `syncStatus in ('synced', 'conflict')`, same as featured quality scoring.
Cap: `photos` holds the 12 newest that day; `totalCount` is the uncapped eligible count. The hero is always `photos[0]` (newest that day).

`cursor` encodes `{ latestAt, tenantId, day }`. The next page is events strictly after that tuple in the sort order, still inside the 30-day window. `nextCursor` is null when no further events exist.

Clustering and cursor comparison live in a pure function (vitest), not in the controller. SQL uses `timezone(timeZone, synced_at)` (timestamptz → local timestamp) then `::date`. Add index `photo_asset (tenant_id, synced_at desc)` so the subscribed-tenant `IN` + window query does not seq-scan.

Do not use `dateTaken`. Do not use `updatedAt` for clustering (featured-directory `lastUpload` today is `max(updatedAt)`; Following/`lastUpload` on the new list is `max(syncedAt)` and is allowed to differ).

## Client

### Container

`GalleriesController` keeps session observation, sign-in button, and deep-link `openGallery`. It owns the segmented control and the default-segment policy.

Children:

| Child | UI | Store |
| --- | --- | --- |
| Timeline | `UITableView` with date section headers and journal cells | `GalleryTimelineStore` |
| Following | `UICollectionView` of strip rows | `GallerySubscriptionStore` |
| Explore | today’s directory collection, restyled cell | existing `GalleryDirectoryStore` |

Shared `GalleryFilmstripView`: horizontal thumbnails, tap → photo id. Used by Explore and Following rows. Timeline journal layout does not use it.

`GalleryCardCell` loses the 2/3 + 1/3 collage and gains the filmstrip. Subscribe button and own-gallery hiding stay.

### Stores

`GallerySubscriptionStore` loads the thickened list. `hasSubscriptions` is `subscriptions.count > 0` after the server’s eligibility filter (empty libraries are already omitted, so a follow with no photos does not count). Persist that boolean in `UserDefaults` keyed by user id so the next cold start can pick Timeline without waiting. A 403/401 is a session problem (existing refresh / sign-in path), not a “no subscriptions” signal.

`GalleryTimelineStore` holds `events`, `nextCursor`, load state. Every request sends the current IANA timezone. Changing time zones does not regroup already-loaded events; the next refresh uses the new zone. Pull-to-refresh replaces the list; trailing loads append.

Do not route Timeline through `PhotoFeedStore`. That store is per-slug masonry.

### Default segment

On appear:

1. If signed out → Discover only.
2. Else read cached `hasSubscriptions`. Cache true → show Timeline and start its first page. Cache false or missing → show Explore.
3. Refresh the subscription list.
4. If the user has not tapped a segment this visit, and the fetched `hasSubscriptions` disagrees with the cache, switch once to match (true → Timeline, false → Explore). After a manual tap, never auto-switch.

### Navigation

Extend `GalleryDetailController` with `focusPhotoID: String?`. After the slug’s `PhotoFeedStore` has photos, if that id is present, present `PhotoDetailViewController` at its index. If the id is missing (deleted, not yet in manifest), show the gallery only.

Filmstrip / journal thumbnails are not the viewer data source. Swiping in the viewer must walk the full gallery feed.

### Mutations

Subscribe / unsubscribe stay `PUT`/`DELETE gallery-subscriptions/:tenantId` with the existing optimistic toggle on Explore.

On successful subscribe: mark the Explore row subscribed, refresh the subscription store, refresh Timeline.
On successful unsubscribe: remove the Following row, drop every loaded Timeline event with that `tenantId`. If that leaves zero subscriptions, Following and Timeline show their empty states. Do **not** auto-switch to Explore; the empty state has a button that selects the Explore segment.
On failed unsubscribe: restore the row; existing alert.

### Loading and errors

| Surface | First paint | Hard failure, no cache | Soft failure |
| --- | --- | --- | --- |
| Timeline | Cached default segment; spinner if events empty and loading | Retry empty state. Stay on Timeline. | Keep events; footer retry for the next page |
| Following | Cached list if any | Retry empty state | Keep cached rows |
| Explore | Unchanged directory cache | Unchanged | Unchanged |

Pull-to-refresh only reloads the visible child.

## Empty states

- **Timeline, zero subscriptions:** “Subscribe to galleries to see new photos.” Button selects Explore.
- **Timeline, subscriptions exist, no events in 30 days:** “No recent updates.” Explain that followed galleries still appear under Following. No retry-as-error.
- **Following, zero subscriptions:** Same invite as Timeline, button selects Explore.
- **Explore:** existing empty directory and search-miss copy.

Visitors never see the first two empty states.

## Edge cases

- Banned / inactive / reserved target: omitted from list and timeline. If a previously loaded row/event refers to one, drop it when the next successful fetch returns without it. A live fetch that 404s a gallery is not a special path; the list just shrinks.
- Day with more than 12 photos: journal shows 12; `totalCount` is informational (no “see all” chrome beyond tapping through to the gallery).
- `focusPhotoID` missing from the manifest: gallery only.
- Timezone change mid-session: next Timeline request reclusters; in-memory events stay as fetched.
- Own galleries: cannot subscribe; they never appear in the two new payloads.
- Deep links that open a gallery on tab 2 are unchanged (`openGallery`). They do not force a segment.

## Testing

**Backend (vitest, next to `gallery-subscription.policy.spec.ts`).**

- Cluster two photos from the same tenant on the same local day → one event; crossing local midnight (explicit offset around a DST-free zone such as `Asia/Tokyo`) → two events.
- Two tenants on the same day → two events, ordered by `latestAt`.
- Photo older than 30 days is excluded.
- More than 12 photos in a day → `photos.length === 12`, `totalCount` is full, `photos[0]` is the newest.
- Cursor: page 1 + page 2 concatenate to the full ordered set with no dupes.
- Invalid `timeZone` → 400.
- Banned / own-gallery tenant is absent from list and events.
- List sort is `lastUpload` desc; `recentPhotos` length ≤ 6 and ordered by `syncedAt` desc.

**Client (XCTest, `modules/photo-masonry/ios/Tests`).**

- Default segment: cached true → Timeline; cached false / missing → Explore; fetch flipping the cache auto-switches only when the user has not tapped.
- Unsubscribe removes that `tenantId` from in-memory timeline events.
- Zero subscriptions vs subscriptions-but-no-30-day-events produce the two distinct Timeline empty kinds.
- Notification banner still hidden when `hasSubscriptions` is false; still uses Following’s flag, not Explore’s featured list.

SwiftUI / cells are not unit-tested. Manual: `native:test` plus Simulator — three segments, strip tap focuses a photo, title tap does not, unsubscribe, empty → Explore button, visitor has no segments.

## Out of scope for this spec

Family Sharing of anything here (not IAP). Changing featured-directory `lastUpload` to `syncedAt`. Server-driven cover photos on `gallery-directory`. Timeline on the web.

## Not blocking implementation

Exact English strings can be tightened in the String Catalog during implementation, as long as the two Timeline empty states remain distinguishable and Explore’s existing keys stay. App Store Connect and plan catalog are irrelevant.
