# Mobile Photo Replica Sync — Design

**Date:** 2026-08-29
**Status:** approved for implementation
**Scope:** Replace iOS page-owned photo snapshots with a server-authoritative tenant replica. Studio upload, tag, delete, and data-sync commit a monotonic revision plus a durable change. The iOS app stores one `(tenantSlug, photoId)` record and projects Home, Map, and Studio from that replica.
**Touches:** `be/packages/db`, `be/apps/core/src/modules/content/{manifest,manifest-sync,photo}`, `be/apps/core/src/modules/infrastructure/data-sync`, `be/apps/core/src/modules/platform/data-management`, `apps/mobile/Afilmory/Core/{PhotoReplica,Data,Persistence,Networking}`, `apps/mobile/Afilmory/Features/{Pages,Upload}`, `apps/mobile/project.yml`.

## Problem

Home and Map read `GET /manifest` through `PhotoFeedStore` and cache a whole-feed JSON blob. Studio reads `GET /photos/assets` into a second in-memory feed. Upload completion only reloads Studio. Returning to Home is a no-op because `load()` treats `.loaded` as fresh. The photos already exist on the server (`syncStatus = synced`) before the SSE `action` event.

## Goals

1. A photo committed by this device appears on Home, Map, and Studio as soon as the server transaction succeeds.
2. Other devices and Web Studio become visible on an active iOS app within seconds; foreground resume always catch-up.
3. Every surface reads the same local replica. Divergence is a named projection, never a second snapshot.
4. Notifications may drop. The change log must not.

## Non-goals

- Offline mutation queue for tags/comments/deletes. Upload already has its own durable queue.
- Delta API for the public web SPA. `GET /manifest` stays the web/recovery path.
- Replacing SwiftData session or explore-directory caches.
- Silent push as a correctness dependency.

## Decisions

1. **Server is the only authority.** iOS GRDB is a disposable replica.
2. **One change per revision.** `(tenantId, revision)` is unique. Batch deletes emit N revisions.
3. **Cursor is contiguous.** Mutation responses may upsert immediately for read-your-writes, but `contiguousRevision` advances only when `next == current + 1`. Gaps trigger `GET /manifest/changes?after=`.
4. **ETag is revision-based:** `"rev-<n>"`. Stale hash ETags miss and refetch, which is correct.
5. **GRDB over SwiftData** for the photo replica. Session/directory stay on SwiftData for this pass.
6. **No feature flags.** Controllers switch in place.

## Consistency

- **Read-your-writes:** the uploading device applies the committed `PhotoChange` from the SSE `action` before the batch finishes.
- **Monotonic UI:** a failed refresh never shrinks the visible set.
- **Eventual convergence:** every successful contiguous apply or snapshot bootstrap converges the replica.
- **Tenant isolation:** rows are keyed by tenant slug; sign-out wipes the replica.

## Protocol

```ts
type PhotoChange = {
  tenantId: string
  revision: number
  operation: 'upsert' | 'delete'
  photoId: string
  assetId: string | null
  published: boolean
  photo: PhotoManifestItem | null
  asset: PhotoAssetListItem | null
}
```

`published` is true when `syncStatus` is `synced` or `conflict`. Home and Map only show published rows. Studio shows every stored asset.

Write path, same transaction:

1. Mutate `photo_asset`.
2. Lock `tenant_manifest_state`, increment `revision`.
3. Insert `tenant_manifest_change`.
4. Commit.
5. Emit `photo.manifest.changed { tenantId, revision }`.
6. Return or SSE-send the `PhotoChange`.

Upload records one change **per photo after that photo’s insert**, then sends SSE `action` with `payload.change`. Partial batch success is allowed; later failures do not roll back earlier revisions.

### Endpoints

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/manifest` | Full published manifest. `ETag: "rev-N"`, `X-Manifest-Revision: N`. 304 via `If-None-Match`. |
| `GET` | `/manifest/snapshot` | `{ revision, manifest }` for iOS bootstrap. |
| `GET` | `/manifest/changes?after=N` | `{ revision, expired, changes[] }` ordered by revision. `expired: true` when `after` is below retention. |
| `GET` | `/manifest/events` | SSE `revision` wakeups. Correctness is the change log. |

Retention: keep 10_000 most recent changes per tenant. Older cursors must bootstrap.

## iOS replica

Tables:

- `photos(tenant_slug, photo_id, asset_id, published, date_taken, payload, applied_revision, …)`
- `studio_assets(tenant_slug, asset_id, photo_id, sync_status, …)`
- `replica_state(tenant_slug, tenant_id, contiguous_revision, needs_reconcile, last_synced_at)`

`PhotoSyncEngine`:

- `ensureSynced(slug)` bootstraps if no state, otherwise pulls changes.
- `applyCommitted(change)` upserts immediately; advances cursor only when contiguous.
- One in-flight sync per slug; overlapping calls coalesce to one follow-up.
- Foreground and SSE wakeup both call `ensureSynced`.
- 401 wipes the replica. Protocol damage or revision regression bootstraps.

Surfaces observe GRDB. They do not own HTTP snapshots. Upload, tag, delete, and data-sync feed committed changes into the engine.

## Error recovery

| Case | Action |
| --- | --- |
| Network failure | Keep replica. Retry on next ensure/foreground. |
| `changes.expired` | Full snapshot bootstrap. |
| Duplicate revision | Idempotent no-op. |
| Gap | Fetch `changes?after=contiguousRevision`. |
| 401 | Wipe replica + existing session cache wipe. |
| Decode failure on one row | Skip row, do not advance past it if it is the next cursor. Snapshot rebuild if stuck. |

## Testing

- Backend: atomic increment, rollback leaves no change, per-photo upload revisions, tag/delete/data-sync, expired cursor, revision ETag.
- iOS: gap/duplicate/out-of-order, mutation write-through, cursor never jumps, delete tombstone, offline retain, tenant switch wipe.
- Integration: first uploaded photo appears on Home/Map/Studio before the batch ends.
