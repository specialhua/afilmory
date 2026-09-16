# Mobile Explore Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give iOS tab 2 three signed-in segments — a journal Timeline of subscribed galleries, a Following list, and the existing Explore directory restyled as title + photo strips — backed by a thickened subscription list and a new timeline endpoint.

**Architecture:** Cluster and paginate timeline events in a pure function (`syncedAt` → local calendar day in the request IANA zone, 30-day window, 12 photos/event). The gallery-subscription service loads eligible targets and their recent `photo_asset` rows from the central table. The iOS `GalleriesController` becomes a container that swaps three long-lived children; Explore keeps `gallery-directory` + cover search (`limit: 6`); Following and Timeline consume the new payloads.

**Tech Stack:** Hono/`@tsuki-hono` + Drizzle + vitest on `be/apps/core`; Swift 6 / UIKit on `apps/mobile` (XcodeGen, XCTest, String Catalogs).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-19-mobile-explore-subscriptions-design.md`. Read it before Task 1.
- **Zero comments by default.** No JSDoc, no narrating comments. Comment only unexpected behavior or a hidden invariant.
- **No feature flags and no backwards-compat shims.** Change `GET /gallery-subscriptions` in place.
- **Clock is `photo_asset.syncedAt`.** Never cluster or sort these surfaces by `dateTaken`. Following `lastUpload` is `max(syncedAt)`, even though featured-directory `lastUpload` is still `max(updatedAt)`.
- **iOS 18, Swift 6, `targeted` concurrency.** Adding or deleting a `.swift` file requires `pnpm --filter @afilmory/mobile native:generate`; commit the regenerated `Afilmory.xcodeproj`.
- **New copy goes in** `apps/mobile/NativeApp/Resources/Localizable.xcstrings`. English source text is the key. Add `ja`, `ko`, `zh-HK`, `zh-Hans`, `zh-Hant`.
- **Files under 500 lines, SwiftUI/UIKit screens under 300.** Split `GalleriesController` instead of growing it.
- Backend tests: `pnpm --filter core exec vitest run <path>`.
- iOS tests from `apps/mobile`: `xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AfilmoryTests/<Suite>`.
- Lint only what you changed: `pnpm exec eslint --fix <paths>`.

---

### Task 1: Timeline clustering policy

Pure function the service will call after it has loaded photos. No database.

**Files:**
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.ts`
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export const TIMELINE_WINDOW_DAYS = 30
export const TIMELINE_PHOTO_CAP = 12
export const TIMELINE_EVENT_LIMIT_DEFAULT = 20
export const TIMELINE_EVENT_LIMIT_MAX = 40

export type GalleryPhotoPreview = {
  id: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  isLivePhoto: boolean
  syncedAt: string
}

export type TimelinePhotoInput = {
  tenantId: string
  preview: GalleryPhotoPreview
}

export type TimelineCursor = {
  latestAt: string
  tenantId: string
  day: string
}

export type TimelineEvent = {
  id: string
  tenantId: string
  day: string
  latestAt: string
  photos: GalleryPhotoPreview[]
  totalCount: number
}

export function isValidTimeZone(timeZone: string): boolean
export function encodeTimelineCursor(cursor: TimelineCursor): string
export function decodeTimelineCursor(raw: string): TimelineCursor | null
export function clusterTimelineEvents(input: {
  photos: TimelinePhotoInput[]
  timeZone: string
  now?: Date
  limit: number
  cursor?: TimelineCursor | null
}): { events: TimelineEvent[], nextCursor: string | null }
```

- [ ] **Step 1: Write the failing test**

Create `gallery-subscription-timeline.policy.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  TIMELINE_PHOTO_CAP,
  clusterTimelineEvents,
  decodeTimelineCursor,
  encodeTimelineCursor,
  isValidTimeZone,
} from './gallery-subscription-timeline.policy'

function preview(id: string, syncedAt: string): TimelinePhotoInput['preview'] {
  return {
    id,
    thumbnailUrl: `https://img.test/${id}.jpg`,
    thumbHash: null,
    width: 100,
    height: 80,
    aspectRatio: 1.25,
    isLivePhoto: false,
    syncedAt,
  }
}

function photo(tenantId: string, id: string, syncedAt: string): TimelinePhotoInput {
  return { tenantId, preview: preview(id, syncedAt) }
}

describe('isValidTimeZone', () => {
  it('accepts IANA identifiers', () => {
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true)
  })

  it('rejects garbage', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})

describe('clusterTimelineEvents', () => {
  it('merges two photos from the same tenant on the same local day', () => {
    const { events } = clusterTimelineEvents({
      photos: [
        photo('t1', 'a', '2026-08-19T03:00:00.000Z'),
        photo('t1', 'b', '2026-08-19T06:00:00.000Z'),
      ],
      timeZone: 'Asia/Tokyo',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 20,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe('t1:2026-08-19')
    expect(events[0]!.day).toBe('2026-08-19')
    expect(events[0]!.photos.map(item => item.id)).toEqual(['b', 'a'])
    expect(events[0]!.latestAt).toBe('2026-08-19T06:00:00.000Z')
    expect(events[0]!.totalCount).toBe(2)
  })

  it('splits a tenant across local midnight in Asia/Tokyo', () => {
    const { events } = clusterTimelineEvents({
      photos: [
        photo('t1', 'before', '2026-08-18T14:30:00.000Z'),
        photo('t1', 'after', '2026-08-18T15:30:00.000Z'),
      ],
      timeZone: 'Asia/Tokyo',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 20,
    })
    expect(events.map(event => event.day)).toEqual(['2026-08-19', '2026-08-18'])
    expect(events).toHaveLength(2)
  })

  it('orders two tenants on the same day by latestAt desc', () => {
    const { events } = clusterTimelineEvents({
      photos: [
        photo('t1', 'old', '2026-08-19T01:00:00.000Z'),
        photo('t2', 'new', '2026-08-19T04:00:00.000Z'),
      ],
      timeZone: 'UTC',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 20,
    })
    expect(events.map(event => event.tenantId)).toEqual(['t2', 't1'])
  })

  it('drops photos older than 30 days', () => {
    const { events } = clusterTimelineEvents({
      photos: [
        photo('t1', 'fresh', '2026-08-10T00:00:00.000Z'),
        photo('t1', 'stale', '2026-07-01T00:00:00.000Z'),
      ],
      timeZone: 'UTC',
      now: new Date('2026-08-19T00:00:00.000Z'),
      limit: 20,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.photos.map(item => item.id)).toEqual(['fresh'])
  })

  it('caps photos at 12 and keeps totalCount', () => {
    const photos = Array.from({ length: 15 }, (_, index) =>
      photo('t1', `p${index}`, new Date(Date.UTC(2026, 7, 19, index)).toISOString()),
    )
    const { events } = clusterTimelineEvents({
      photos,
      timeZone: 'UTC',
      now: new Date('2026-08-19T20:00:00.000Z'),
      limit: 20,
    })
    expect(events[0]!.photos).toHaveLength(TIMELINE_PHOTO_CAP)
    expect(events[0]!.photos[0]!.id).toBe('p14')
    expect(events[0]!.totalCount).toBe(15)
  })

  it('paginates without duplicates', () => {
    const photos = ['a', 'b', 'c', 'd'].map((tenantId, index) =>
      photo(tenantId, tenantId, new Date(Date.UTC(2026, 7, 19, 10 - index)).toISOString()),
    )
    const first = clusterTimelineEvents({
      photos,
      timeZone: 'UTC',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 2,
    })
    expect(first.events.map(event => event.tenantId)).toEqual(['a', 'b'])
    expect(first.nextCursor).toBeTruthy()
    const cursor = decodeTimelineCursor(first.nextCursor!)
    const second = clusterTimelineEvents({
      photos,
      timeZone: 'UTC',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 2,
      cursor,
    })
    expect(second.events.map(event => event.tenantId)).toEqual(['c', 'd'])
    expect(second.nextCursor).toBeNull()
    const ids = [...first.events, ...second.events].map(event => event.id)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('timeline cursor', () => {
  it('round-trips', () => {
    const encoded = encodeTimelineCursor({
      latestAt: '2026-08-19T06:00:00.000Z',
      tenantId: 't1',
      day: '2026-08-19',
    })
    expect(decodeTimelineCursor(encoded)).toEqual({
      latestAt: '2026-08-19T06:00:00.000Z',
      tenantId: 't1',
      day: '2026-08-19',
    })
  })

  it('returns null for garbage', () => {
    expect(decodeTimelineCursor('%%%')).toBeNull()
    expect(decodeTimelineCursor('not-json')).toBeNull()
  })
})
```

Tokyo is UTC+9, so `2026-08-18T14:30:00.000Z` is still the 18th and `2026-08-18T15:30:00.000Z` is the 19th. Newest event first.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the policy**

```ts
import { Buffer } from 'node:buffer'

export const TIMELINE_WINDOW_DAYS = 30
export const TIMELINE_PHOTO_CAP = 12
export const TIMELINE_EVENT_LIMIT_DEFAULT = 20
export const TIMELINE_EVENT_LIMIT_MAX = 40

export type GalleryPhotoPreview = {
  id: string
  thumbnailUrl: string
  thumbHash: string | null
  width: number
  height: number
  aspectRatio: number
  isLivePhoto: boolean
  syncedAt: string
}

export type TimelinePhotoInput = {
  tenantId: string
  preview: GalleryPhotoPreview
}

export type TimelineCursor = {
  latestAt: string
  tenantId: string
  day: string
}

export type TimelineEvent = {
  id: string
  tenantId: string
  day: string
  latestAt: string
  photos: GalleryPhotoPreview[]
  totalCount: number
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) {
    return false
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeTimelineCursor(raw: string): TimelineCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<TimelineCursor>
    if (
      typeof parsed.latestAt === 'string'
      && typeof parsed.tenantId === 'string'
      && typeof parsed.day === 'string'
    ) {
      return { latestAt: parsed.latestAt, tenantId: parsed.tenantId, day: parsed.day }
    }
    return null
  } catch {
    return null
  }
}

function isAfterCursor(event: TimelineEvent, cursor: TimelineCursor): boolean {
  if (event.latestAt < cursor.latestAt) {
    return true
  }
  if (event.latestAt > cursor.latestAt) {
    return false
  }
  return event.tenantId > cursor.tenantId
}

export function clusterTimelineEvents(input: {
  photos: TimelinePhotoInput[]
  timeZone: string
  now?: Date
  limit: number
  cursor?: TimelineCursor | null
}): { events: TimelineEvent[], nextCursor: string | null } {
  const now = input.now ?? new Date()
  const windowStart = now.getTime() - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const grouped = new Map<string, TimelinePhotoInput[]>()

  for (const photo of input.photos) {
    const at = Date.parse(photo.preview.syncedAt)
    if (Number.isNaN(at) || at < windowStart) {
      continue
    }
    const day = localDay(photo.preview.syncedAt, input.timeZone)
    const key = `${photo.tenantId}:${day}`
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(photo)
    } else {
      grouped.set(key, [photo])
    }
  }

  const events = [...grouped.entries()]
    .map(([key, items]) => {
      const [tenantId, day] = key.split(':') as [string, string]
      const sorted = [...items].sort((left, right) => right.preview.syncedAt.localeCompare(left.preview.syncedAt))
      return {
        id: key,
        tenantId,
        day,
        latestAt: sorted[0]!.preview.syncedAt,
        totalCount: sorted.length,
        photos: sorted.slice(0, TIMELINE_PHOTO_CAP).map(item => item.preview),
      }
    })
    .sort((left, right) => {
      if (left.latestAt !== right.latestAt) {
        return right.latestAt.localeCompare(left.latestAt)
      }
      return left.tenantId.localeCompare(right.tenantId)
    })
    .filter(event => !input.cursor || isAfterCursor(event, input.cursor))

  const page = events.slice(0, input.limit)
  const last = page.at(-1)
  const nextCursor =
    page.length === input.limit && last
      ? encodeTimelineCursor({ latestAt: last.latestAt, tenantId: last.tenantId, day: last.day })
      : null

  return { events: page, nextCursor }
}
```

If `nextCursor` is set when the last page is exactly `limit` long but no more events exist, also check `events.length > input.limit` before encoding. The implementation above already does that via `page.length === input.limit` only after filter+sort of the full set — if the remainder is empty, `events.length === input.limit` still encodes a cursor that yields `[]` on the next call. Change the condition to `events.length > input.limit`.

- [ ] **Step 4: Re-run the tests**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.ts \
  be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.policy.spec.ts
git commit -m "feat(billing): cluster gallery subscription timeline events"
```

---

### Task 2: Manifest → preview mapper

**Files:**
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-preview.ts`
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-preview.spec.ts`

**Interfaces:**
- Consumes: `GalleryPhotoPreview` from Task 1; `PhotoManifestItem` from `@afilmory/db` / `@afilmory/typing`.
- Produces: `toGalleryPhotoPreview(input: { photoId: string, syncedAt: string, manifest: PhotoManifestItem | null | undefined }): GalleryPhotoPreview | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { toGalleryPhotoPreview } from './gallery-subscription-preview'

const base = {
  id: 'p1',
  title: '',
  dateTaken: '',
  tags: [],
  description: '',
  originalUrl: 'https://img.test/o.jpg',
  format: 'jpg',
  thumbnailUrl: 'https://img.test/t.jpg',
  thumbHash: 'abcd',
  width: 200,
  height: 100,
  aspectRatio: 2,
  s3Key: 'k',
  lastModified: '',
  size: 1,
  exif: null,
  toneAnalysis: null,
  location: null,
}

describe('toGalleryPhotoPreview', () => {
  it('returns null when the thumbnail is missing', () => {
    expect(
      toGalleryPhotoPreview({
        photoId: 'p1',
        syncedAt: '2026-08-19T00:00:00.000Z',
        manifest: { ...base, thumbnailUrl: '   ' },
      }),
    ).toBeNull()
    expect(
      toGalleryPhotoPreview({
        photoId: 'p1',
        syncedAt: '2026-08-19T00:00:00.000Z',
        manifest: null,
      }),
    ).toBeNull()
  })

  it('maps live photos from manifest.video.type', () => {
    const preview = toGalleryPhotoPreview({
      photoId: 'live-1',
      syncedAt: '2026-08-19T00:00:00.000Z',
      manifest: {
        ...base,
        video: { type: 'live-photo', videoUrl: 'https://img.test/v.mov', s3Key: 'v' },
      },
    })
    expect(preview).toMatchObject({
      id: 'live-1',
      thumbnailUrl: 'https://img.test/t.jpg',
      thumbHash: 'abcd',
      width: 200,
      height: 100,
      aspectRatio: 2,
      isLivePhoto: true,
      syncedAt: '2026-08-19T00:00:00.000Z',
    })
  })

  it('treats motion photos as stills', () => {
    const preview = toGalleryPhotoPreview({
      photoId: 'p1',
      syncedAt: '2026-08-19T00:00:00.000Z',
      manifest: { ...base, video: { type: 'motion-photo', offset: 12 } },
    })
    expect(preview?.isLivePhoto).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-preview.spec.ts`

Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

```ts
import type { PhotoManifestItem } from '@afilmory/db'

import type { GalleryPhotoPreview } from './gallery-subscription-timeline.policy'

export function toGalleryPhotoPreview(input: {
  photoId: string
  syncedAt: string
  manifest: PhotoManifestItem | null | undefined
}): GalleryPhotoPreview | null {
  const thumbnailUrl = input.manifest?.thumbnailUrl?.trim()
  if (!thumbnailUrl) {
    return null
  }
  const width = input.manifest?.width ?? 0
  const height = input.manifest?.height ?? 0
  const aspectRatio =
    input.manifest?.aspectRatio
    ?? (width > 0 && height > 0 ? width / height : 1)
  return {
    id: input.photoId,
    thumbnailUrl,
    thumbHash: input.manifest?.thumbHash ?? null,
    width,
    height,
    aspectRatio,
    isLivePhoto: input.manifest?.video?.type === 'live-photo',
    syncedAt: input.syncedAt,
  }
}
```

If `@afilmory/db` does not re-export `PhotoManifestItem`, import it from `@afilmory/typing`.

- [ ] **Step 4: Re-run the tests**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-preview.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-preview.ts \
  be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-preview.spec.ts
git commit -m "feat(billing): map photo manifests to subscription previews"
```

---

### Task 3: Thicken `GET /gallery-subscriptions`

Replace `{ tenantId, createdAt }[]`. Empty libraries and ineligible tenants disappear.

**Files:**
- Modify: `be/packages/db/src/schema.ts` (`photoAssets` indexes — add here so Task 4’s query is indexed; generating the migration can wait for Task 4 if you prefer one migration)
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-list.policy.ts`
- Create: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-list.policy.spec.ts`
- Modify: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription.service.ts`
- Modify: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription.controller.ts`

**Interfaces:**
- Consumes: `evaluateGallerySubscription`; `toGalleryPhotoPreview`; `GalleryPhotoPreview`.
- Produces: `listForUser` returns `{ subscriptions: GallerySubscriptionSummary[] }` where

```ts
export type GallerySubscriptionSummary = {
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
  recentPhotos: GalleryPhotoPreview[]
}
```

- [ ] **Step 1: Write the failing assembler test**

```ts
import { describe, expect, it } from 'vitest'

import { assembleSubscriptionSummaries } from './gallery-subscription-list.policy'

const preview = {
  id: 'p1',
  thumbnailUrl: 'https://img.test/p1.jpg',
  thumbHash: null,
  width: 1,
  height: 1,
  aspectRatio: 1,
  isLivePhoto: false,
  syncedAt: '2026-08-19T02:00:00.000Z',
}

describe('assembleSubscriptionSummaries', () => {
  it('drops ineligible and empty libraries and sorts by lastUpload desc', () => {
    const rows = assembleSubscriptionSummaries({
      subscriptions: [
        { tenantId: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { tenantId: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
        { tenantId: 'empty', createdAt: '2026-01-03T00:00:00.000Z' },
        { tenantId: 'own', createdAt: '2026-01-04T00:00:00.000Z' },
        { tenantId: 'banned', createdAt: '2026-01-05T00:00:00.000Z' },
      ],
      targets: {
        old: { banned: false, slug: 'old', status: 'active', name: 'Old', domain: null, author: null },
        new: { banned: false, slug: 'new', status: 'active', name: 'New', domain: null, author: null },
        empty: { banned: false, slug: 'empty', status: 'active', name: 'Empty', domain: null, author: null },
        own: { banned: false, slug: 'own', status: 'active', name: 'Own', domain: null, author: null },
        banned: { banned: true, slug: 'banned', status: 'active', name: 'Banned', domain: null, author: null },
      },
      memberTenantIds: new Set(['own']),
      photos: {
        old: [{ ...preview, id: 'o1', syncedAt: '2026-08-01T00:00:00.000Z' }],
        new: [
          { ...preview, id: 'n2', syncedAt: '2026-08-10T00:00:00.000Z' },
          { ...preview, id: 'n1', syncedAt: '2026-08-11T00:00:00.000Z' },
        ],
      },
    })

    expect(rows.map(row => row.tenantId)).toEqual(['new', 'old'])
    expect(rows[0]!.gallery.lastUpload).toBe('2026-08-11T00:00:00.000Z')
    expect(rows[0]!.recentPhotos.map(item => item.id)).toEqual(['n1', 'n2'])
    expect(rows[0]!.recentPhotos).toHaveLength(2)
  })

  it('keeps at most 6 recent photos newest first', () => {
    const photos = Array.from({ length: 8 }, (_, index) => ({
      ...preview,
      id: `p${index}`,
      syncedAt: new Date(Date.UTC(2026, 7, 1, index)).toISOString(),
    }))
    const [row] = assembleSubscriptionSummaries({
      subscriptions: [{ tenantId: 't', createdAt: '2026-01-01T00:00:00.000Z' }],
      targets: {
        t: { banned: false, slug: 't', status: 'active', name: 'T', domain: null, author: null },
      },
      memberTenantIds: new Set(),
      photos: { t: photos },
    })
    expect(row!.recentPhotos).toHaveLength(6)
    expect(row!.recentPhotos[0]!.id).toBe('p7')
  })
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-list.policy.spec.ts`

- [ ] **Step 3: Implement `assembleSubscriptionSummaries` and wire `listForUser`**

Assembler: call `evaluateGallerySubscription(target, memberTenantIds.has(id))`; skip if not allowed; skip if `photos[id]` is missing/empty; sort remaining photos by `syncedAt` desc; take 6; `lastUpload` is photos[0].syncedAt; `photoCount` is the full eligible count you were given (pass `photoCount` on the target or `photos[id].length` if the service already filtered to eligible assets — use the count the service supplies as `photoCounts: Record<string, number>` if the photo arrays are already truncated). Keep it simple: `photoCount` = untruncated array length **before** the 6-cap, so the service must pass all eligible photos or a separate count. Spec: `photoCount` is the gallery’s library size, not the 6-preview length. Have the service pass `photoCounts[tenantId]`.

Service `listForUser`:

1. Load subscription rows for `userId` (existing query).
2. Load those tenants + site.name setting + owner author + first custom domain (same joins as `featured-galleries.service.ts`).
3. Load active membership tenant ids for this user among those targets.
4. Load `photo_asset` rows for those tenant ids where `syncStatus in ('synced', 'conflict')`, selecting `tenantId, photoId, syncedAt, manifest`.
5. Map each asset through `toGalleryPhotoPreview`; drop nulls.
6. `assembleSubscriptionSummaries(...)`.
7. Return `{ subscriptions }`.

Controller `list()` already returns the service result — keep that. Do not wrap twice.

- [ ] **Step 4: Run both spec files**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-list.policy.spec.ts src/modules/platform/gallery-subscriptions/gallery-subscription.policy.spec.ts`

Expected: PASS. Then `pnpm exec eslint --fix be/apps/core/src/modules/platform/gallery-subscriptions`.

- [ ] **Step 5: Commit**

```bash
git add be/apps/core/src/modules/platform/gallery-subscriptions
git commit -m "feat(core): return gallery cards and recent photos on subscription list"
```

---

### Task 4: Timeline endpoint + index

**Files:**
- Modify: `be/packages/db/src/schema.ts` — on `photoAssets` indexes array add `index('idx_photo_asset_tenant_synced').on(t.tenantId, t.syncedAt)`
- Create: generated Drizzle migration under `be/packages/db/migrations/` via `pnpm --filter @afilmory/be db:generate`
- Modify: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription.dto.ts`
- Modify: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription.service.ts`
- Modify: `be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription.controller.ts`

**Interfaces:**
- Consumes: Task 1 policy, Task 2 mapper, Task 3 eligibility loading.
- Produces: `listTimelineForUser(userId: string, query: { timeZone: string, limit: number, cursor?: string }): Promise<{ events: Array<TimelineEvent & { gallery: TimelineGallery }>, nextCursor: string | null }>`
- `TimelineGallery = { id: string, name: string, slug: string, author: { name: string, avatar: string | null } | null }`
- Invalid `timeZone` or undecodable `cursor` → `BizException(ErrorCode.COMMON_BAD_REQUEST)`.

- [ ] **Step 1: Write a service-level policy test for attaching galleries**

If attaching galleries is a one-liner in the service, skip a new file and instead add a controller DTO test only if you extract `parseTimelineQuery`. Minimum: extend the clustering spec is already done — add:

`be/apps/core/src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.query.spec.ts`

```ts
import { describe, expect, it } from 'vitest'

import { parseTimelineQuery } from './gallery-subscription-timeline.query'

describe('parseTimelineQuery', () => {
  it('rejects an invalid time zone', () => {
    expect(() => parseTimelineQuery({ timeZone: 'Nope' })).toThrow(/timeZone/)
  })

  it('clamps limit and decodes a cursor', () => {
    const parsed = parseTimelineQuery({
      timeZone: 'UTC',
      limit: '99',
      cursor: Buffer.from(
        JSON.stringify({ latestAt: '2026-08-19T00:00:00.000Z', tenantId: 't', day: '2026-08-19' }),
        'utf8',
      ).toString('base64url'),
    })
    expect(parsed.limit).toBe(40)
    expect(parsed.cursor?.tenantId).toBe('t')
  })
})
```

Throw a plain `Error('timeZone')` from `parseTimelineQuery` and let the service wrap it in `BizException`, **or** throw `BizException` directly and assert `error.code` / `getHttpStatus()`. Prefer `BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Invalid time zone.' })`.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions/gallery-subscription-timeline.query.spec.ts`

- [ ] **Step 3: Implement query parse, service method, controller, index**

DTO:

```ts
export class GallerySubscriptionTimelineQueryDto extends createZodSchemaDto(
  z.object({
    timeZone: z.string().trim().min(1).max(80),
    limit: z.coerce.number().int().min(1).max(40).default(20),
    cursor: z.string().trim().min(1).optional(),
  }),
) {}
```

Controller:

```ts
@Get('/timeline')
async timeline(@Query() query: GallerySubscriptionTimelineQueryDto) {
  return await this.subscriptions.listTimelineForUser(this.requireUserId(), query)
}
```

**Register `/timeline` before `/:tenantId`.** Current `PUT /:tenantId` will not collide with GET, but keep the static path first anyway.

`listTimelineForUser`:

1. `parseTimelineQuery`.
2. Reuse the same eligible-tenant resolution as `listForUser` (extract `loadEligibleTargets(userId)` so list and timeline do not diverge).
3. Load photos for those tenant ids with `syncedAt >= now - 30 days` and `syncStatus in ('synced','conflict')`.
4. Map through `toGalleryPhotoPreview`; drop nulls.
5. `clusterTimelineEvents`.
6. Attach `gallery: { id, name, slug, author }` from the eligible target map. Drop any event whose tenant disappeared (should not happen).

Add the index on `photoAssets`, then:

```bash
pnpm --filter @afilmory/be db:generate
```

Commit the generated SQL and snapshot.

- [ ] **Step 4: Tests + lint**

Run: `pnpm --filter core exec vitest run src/modules/platform/gallery-subscriptions`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/packages/db/src/schema.ts be/packages/db/migrations \
  be/apps/core/src/modules/platform/gallery-subscriptions
git commit -m "feat(core): add gallery subscription timeline endpoint"
```

---

### Task 5: iOS models, API, and pure segment/timeline state

**Files:**
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GallerySubscription.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/ExploreSegmentPolicy.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryTimelineState.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Tests/ExploreSegmentPolicyTests.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Tests/GalleryTimelineStateTests.swift`

**Interfaces:**
- Consumes: Task 3/4 JSON shapes.
- Produces:

```swift
struct GalleryPhotoPreview: Decodable, Hashable, Sendable {
  let id: String
  let thumbnailUrl: String
  let thumbHash: String?
  let width: Double
  let height: Double
  let aspectRatio: Double
  let isLivePhoto: Bool
  let syncedAt: String
}

struct GallerySubscriptionItem: Decodable, Hashable, Sendable {
  let tenantId: String
  let createdAt: String
  let gallery: Gallery
  let recentPhotos: [GalleryPhotoPreview]
  struct Gallery: Decodable, Hashable, Sendable {
    let id: String
    let name: String
    let slug: String
    let domain: String?
    let author: FeaturedGalleryAuthor?
    let photoCount: Int
    let lastUpload: String
  }
}

struct GallerySubscriptionListResponse: Decodable, Sendable {
  let subscriptions: [GallerySubscriptionItem]
}

struct GalleryTimelineEvent: Decodable, Hashable, Sendable {
  let id: String
  let tenantId: String
  let day: String
  let latestAt: String
  let gallery: Gallery
  let photos: [GalleryPhotoPreview]
  let totalCount: Int
  struct Gallery: Decodable, Hashable, Sendable {
    let id: String
    let name: String
    let slug: String
    let author: FeaturedGalleryAuthor?
  }
}

struct GalleryTimelineResponse: Decodable, Sendable {
  let events: [GalleryTimelineEvent]
  let nextCursor: String?
}

enum ExploreSegment: Int {
  case timeline
  case following
  case explore
}

func resolveExploreDefaultSegment(isSignedIn: Bool, cachedHasSubscriptions: Bool?) -> ExploreSegment
func resolveExploreSegmentAfterFetch(current: ExploreSegment, userHasChosen: Bool, hasSubscriptions: Bool) -> ExploreSegment

enum TimelineEmptyKind: Equatable {
  case none
  case noSubscriptions
  case noRecentUpdates
}

func resolveTimelineEmptyKind(hasSubscriptions: Bool, eventCount: Int, isLoading: Bool, loadFailed: Bool) -> TimelineEmptyKind
func removingTimelineEvents(_ events: [GalleryTimelineEvent], tenantId: String) -> [GalleryTimelineEvent]
```

API:

```swift
enum GallerySubscriptionAPI {
  static func list() -> APIEndpoint { APIEndpoint(baseURL: .platform, path: "gallery-subscriptions", retryPolicy: .transientGET(maxAttempts: 2, delay: 0.25)) }
  static func timeline(timeZone: String, cursor: String?, limit: Int = 20) -> APIEndpoint
  static func subscribe(tenantId: String) -> APIEndpoint // existing
  static func unsubscribe(tenantId: String) -> APIEndpoint // existing
}
```

- [ ] **Step 1: Write the failing XCTest cases**

`ExploreSegmentPolicyTests.swift`:

```swift
import XCTest
@testable import Afilmory

final class ExploreSegmentPolicyTests: XCTestCase {
  func testSignedOutAlwaysExplore() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: false, cachedHasSubscriptions: true), .explore)
  }

  func testCachedTrueOpensTimeline() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: true), .timeline)
  }

  func testMissingCacheOpensExplore() {
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: nil), .explore)
    XCTAssertEqual(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: false), .explore)
  }

  func testFetchDoesNotOverrideAManualChoice() {
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .explore, userHasChosen: true, hasSubscriptions: true),
      .explore
    )
  }

  func testFetchCalibratesWhenTheUserHasNotChosen() {
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .explore, userHasChosen: false, hasSubscriptions: true),
      .timeline
    )
    XCTAssertEqual(
      resolveExploreSegmentAfterFetch(current: .timeline, userHasChosen: false, hasSubscriptions: false),
      .explore
    )
  }
}
```

`GalleryTimelineStateTests.swift`:

```swift
import XCTest
@testable import Afilmory

final class GalleryTimelineStateTests: XCTestCase {
  func testEmptyKinds() {
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: false, eventCount: 0, isLoading: false, loadFailed: false),
      .noSubscriptions
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: false, loadFailed: false),
      .noRecentUpdates
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: true, loadFailed: false),
      .none
    )
    XCTAssertEqual(
      resolveTimelineEmptyKind(hasSubscriptions: true, eventCount: 0, isLoading: false, loadFailed: true),
      .none
    )
  }

  func testDropTenant() {
    let kept = GalleryTimelineEvent(
      id: "a:2026-08-19",
      tenantId: "a",
      day: "2026-08-19",
      latestAt: "2026-08-19T00:00:00.000Z",
      gallery: .init(id: "a", name: "A", slug: "a", author: nil),
      photos: [],
      totalCount: 0
    )
    let dropped = GalleryTimelineEvent(
      id: "b:2026-08-19",
      tenantId: "b",
      day: "2026-08-19",
      latestAt: "2026-08-19T00:00:00.000Z",
      gallery: .init(id: "b", name: "B", slug: "b", author: nil),
      photos: [],
      totalCount: 0
    )
    XCTAssertEqual(removingTimelineEvents([kept, dropped], tenantId: "b").map(\.tenantId), ["a"])
  }
}
```

- [ ] **Step 2: Generate project and run tests — expect FAIL**

```bash
pnpm --filter @afilmory/mobile native:generate
cd apps/mobile && xcodebuild test -project Afilmory.xcodeproj -scheme 'Afilmory Local' \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:AfilmoryTests/ExploreSegmentPolicyTests \
  -only-testing:AfilmoryTests/GalleryTimelineStateTests
```

Expected: FAIL, symbols missing.

- [ ] **Step 3: Implement the types, policy functions, and API endpoints**

`timeline` query items: `timeZone`, `limit`, optional `cursor`.

Default-segment and empty-kind functions are the exact tables in the spec. `loadFailed` yields `.none` so the controller can show the retry empty configuration instead of “No recent updates.”

- [ ] **Step 4: Re-run the two suites**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/modules/photo-masonry/ios/Pages/GallerySubscription.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/ExploreSegmentPolicy.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/GalleryTimelineState.swift \
  apps/mobile/modules/photo-masonry/ios/Tests/ExploreSegmentPolicyTests.swift \
  apps/mobile/modules/photo-masonry/ios/Tests/GalleryTimelineStateTests.swift \
  apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): add explore segment policy and subscription payloads"
```

---

### Task 6: Filmstrip + restyle Explore cards

**Files:**
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryFilmstripView.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryCardCell.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GalleriesController.swift` — cover `limit: 3` → `6`; pass `onPhotoTap`
- Modify: `apps/mobile/modules/photo-masonry/ios/Tests/GallerySubscriptionStateTests.swift` — `preferredHeight` still has to fit the subscribed button on one line

**Interfaces:**
- Consumes: `GalleryCoverPhoto` / `GalleryPhotoPreview` via a small `GalleryFilmstripItem` (`id`, `thumbnailUrl`, `thumbHash`, `aspectRatio`, `isLivePhoto`).
- Produces: `GalleryFilmstripView` with `configure(items:onSelect:)` ; `GalleryCardCell.configure(..., covers:, onPhotoTap: ((String) -> Void)?)` ; `preferredHeight(for:)` = title row 52 + 8 + strip 116 + 16 = **192**.

- [ ] **Step 1: Extend the existing button-fit test if height changes, then run it**

Update `GalleryCardCell` first in the same task after seeing the current test still compile. The subscribed-button test only cares about the title label, not collage height.

- [ ] **Step 2: Replace the collage in `GalleryCardCell`**

Remove `primaryCover` / `secondaryTopCover` / `secondaryBottomCover`. Put `GalleryFilmstripView` under the identity row. Keep avatar, name, description, photo count, tags, subscribe button. Filmstrip items come from `covers`. Tapping a thumbnail calls `onPhotoTap?(id)` and must not fire the cell’s gallery tap. Disable `isUserInteractionEnabled` on the filmstrip when `onPhotoTap` is nil.

Strip: horizontal `UIScrollView`, 92×116 thumbnails, 5pt gap, `SDWebImage` + thumbhash placeholder (copy the load path from the old `GalleryCoverView`). Live Photo badge if `isLivePhoto`.

Cover fetch in `GalleriesController.loadCovers`: `GalleryCoverSearchRequest(limit: 6, sort: "desc")`.

`collectionView(_:didSelect:)` stays “open gallery, no focus.” Photo tap will be wired in Task 9.

- [ ] **Step 3: `native:generate` and run `GallerySubscriptionStateTests`**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/modules/photo-masonry/ios/Pages/GalleryFilmstripView.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/GalleryCardCell.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/GalleriesController.swift \
  apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): restyle explore cards as photo strips"
```

---

### Task 7: Subscription and timeline stores

**Files:**
- Create: `apps/mobile/modules/photo-masonry/ios/Data/GallerySubscriptionStore.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Data/GalleryTimelineStore.swift`

**Interfaces:**
- Consumes: Task 5 API types.
- Produces:

```swift
@MainActor
final class GallerySubscriptionStore {
  static let shared: GallerySubscriptionStore
  private(set) var subscriptions: [GallerySubscriptionItem]
  var hasSubscriptions: Bool { !subscriptions.isEmpty }
  func cachedHasSubscriptions(userId: String) -> Bool?
  func load(userId: String, force: Bool) async
  func remove(tenantId: String)
}

@MainActor
final class GalleryTimelineStore {
  static let shared: GalleryTimelineStore
  private(set) var events: [GalleryTimelineEvent]
  private(set) var nextCursor: String?
  private(set) var isLoading: Bool
  private(set) var loadFailed: Bool
  func refresh(timeZone: String) async
  func loadMore(timeZone: String) async
  func removeEvents(tenantId: String)
}
```

`UserDefaults` key: `"explore.hasSubscriptions.\(userId)"`. Write it whenever `load` succeeds. `401/403` must not write `false`.

`GalleryTimelineStore.refresh` replaces `events` and `nextCursor`. `loadMore` no-ops if `nextCursor == nil` or `isLoading`. On loadMore failure set `loadFailed` but keep events. Use `TimeZone.current.identifier` at the call site, not inside the store, so tests can pass `"UTC"`.

Observation: follow `GalleryDirectoryStore` (no Combine required). Children can reload on `viewWillAppear` plus explicit `store.load` from the container. If you need live updates, add an `observe` token matching `PhotoFeed` — only if a child cannot simply be told to `reload()` after the container awaits `load`. Prefer the container calling `child.reload()` after store methods finish.

- [ ] **Step 1: No isolated unit test for the live store** — policy/empty-kind already cover the decisions. Implement the stores.
- [ ] **Step 2: `native:generate`**
- [ ] **Step 3: Commit**

```bash
git add apps/mobile/modules/photo-masonry/ios/Data/GallerySubscriptionStore.swift \
  apps/mobile/modules/photo-masonry/ios/Data/GalleryTimelineStore.swift \
  apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): add subscription and timeline stores"
```

---

### Task 8: Split Explore into a container and three children

Visitor: no segmented control, Discover only. Signed-in: `Timeline | Following | Explore`.

**Files:**
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GalleriesController.swift` — become the container (title, segment, session, `openGallery`, default-segment policy)
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/ExploreDirectoryController.swift` — move the current collection / search / cover-fetch / subscribe-on-card code here
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/FollowingGalleriesController.swift`
- Create: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryTimelineController.swift`
- Modify: `apps/mobile/NativeApp/Resources/Localizable.xcstrings` — add keys below
- Modify: `apps/mobile/NativeApp/App/ApplicationCoordinator.swift` only if `openGallery` / visitor construction needs a new initializer

**Interfaces:**
- Consumes: stores, policies, `GalleryCardCell`, `GalleryFilmstripView`.
- Produces: `GalleriesController.selectExploreSegment()` for empty-state buttons; `openGallery(_ request:)` unchanged.

**Copy to add** (English source = key; translate ja/ko/zh-HK/zh-Hans/zh-Hant):

| Key | Notes |
| --- | --- |
| `Timeline` | Segment |
| `Following` | Segment |
| `Subscribe to galleries to see new photos.` | Timeline / Following empty |
| `Browse galleries` | Empty-state button |
| `No recent updates` | Timeline empty when subscribed |
| `Followed galleries still appear under Following.` | Timeline empty detail |
| `Unsubscribe` | Already exists — reuse |

- [ ] **Step 1: Move Discover into `ExploreDirectoryController`**

Cut collection view, search, cover cache, subscribe toggle, notification **out of** the container. Notification banner does **not** stay on Explore — it moves to Following in the next bullets. After the move, visitor `GalleriesController` embeds only Discover and does not install `navigationItem.searchController` itself; Discover sets the search controller on the parent navigation item when it is visible, and the container clears it when showing another segment.

Keep `GalleriesController` under 300 lines.

- [ ] **Step 2: Following child**

`UICollectionView` of `GalleryCardCell` configured with `subscriptionState: .hidden`, `covers` mapped from `recentPhotos` (no cover search). Leading swipe: `UISwipeActionsConfiguration` with **Unsubscribe**. Context menu: the same action. Optimistic remove via `GallerySubscriptionStore.remove` + `GalleryTimelineStore.removeEvents`; on API failure restore by `load(force: true)` and present the existing alert.

Header: notification banner using `GallerySubscriptionStore.hasSubscriptions`.

Empty: zero subscriptions → copy + button → `container.selectExploreSegment()`.

- [ ] **Step 3: Timeline child**

`UITableView`, sections grouped by `event.day` (do not recompute from `latestAt`). Section title: if `event.day == today` in `TimeZone.current` → `String(localized: "Today")`; yesterday → `Yesterday`; else `DateFormatter.localizedString` from `event.day`.

Cell: avatar, name, `latestAt` time, hero `photos[0]`, thumbnail row `photos[1...]`. Title tap → gallery, no focus. Photo tap → gallery + `focusPhotoID` (Task 9 can no-op the focus until that task lands; still pass the id).

`scrollViewDidScroll` near bottom → `timelineStore.loadMore(timeZone:)`. Pull-to-refresh → `refresh`. Footer retry if `loadFailed && !events.isEmpty`. First-page hard fail → `UIContentUnavailableConfiguration` retry. Empty kinds from `resolveTimelineEmptyKind`; `.noSubscriptions` / `.noRecentUpdates` use the copy table.

- [ ] **Step 4: Container default-segment**

`viewWillAppear` / session sign-in:

```swift
let userId = session.user.id
let cached = GallerySubscriptionStore.shared.cachedHasSubscriptions(userId: userId)
show(resolveExploreDefaultSegment(isSignedIn: true, cachedHasSubscriptions: cached))
await GallerySubscriptionStore.shared.load(userId: userId, force: false)
if !userHasChosen {
  show(resolveExploreSegmentAfterFetch(
    current: currentSegment,
    userHasChosen: false,
    hasSubscriptions: GallerySubscriptionStore.shared.hasSubscriptions
  ))
}
if currentSegment == .timeline {
  await GalleryTimelineStore.shared.refresh(timeZone: TimeZone.current.identifier)
}
```

Signed out: hide segment control, show Discover only, `userHasChosen = false`.

- [ ] **Step 5: `native:generate`, `GallerySubscriptionStateTests` + new policy tests, Simulator compile**

```bash
pnpm --filter @afilmory/mobile native:generate
pnpm --filter @afilmory/mobile native:test
```

Expected: existing suites PASS. Manual on Simulator: signed-out = directory only; signed-in with cached subs opens Timeline.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/modules/photo-masonry/ios/Pages \
  apps/mobile/NativeApp/Resources/Localizable.xcstrings \
  apps/mobile/Afilmory.xcodeproj
git commit -m "feat(mobile): split explore into timeline, following, and directory"
```

---

### Task 9: Focused photo on gallery detail + mutation refresh

**Files:**
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryDetailController.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/ExploreDirectoryController.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/FollowingGalleriesController.swift`
- Modify: `apps/mobile/modules/photo-masonry/ios/Pages/GalleryTimelineController.swift`

**Interfaces:**
- Consumes: `PhotoFeedStore`, `PhotoDetailViewController`.
- Produces: `GalleryDetailController.init(slug:title:onRequestSignIn:focusPhotoID:)` with `focusPhotoID: String? = nil`.

- [ ] **Step 1: Add `focusPhotoID` and present once**

Store `focusPhotoID`. In `render()`, if feed has photos and `focusPhotoID` matches an id, call the existing `presentPhoto(at:)` **once** (clear the stored id so pull-to-refresh does not re-present). If the id is absent after a successful load (`loadState == .ready` or equivalent non-loading success), clear it and do not present.

- [ ] **Step 2: Wire taps**

Directory / Following / Timeline title → `focusPhotoID: nil`. Strip / hero / thumbnail → pass that photo id.

- [ ] **Step 3: After subscribe on Explore**

On success: `await GallerySubscriptionStore.shared.load(userId:force: true)` and `await GalleryTimelineStore.shared.refresh(timeZone:)`. Existing optimistic button stays.

- [ ] **Step 4: `native:test`**

Expected: PASS. Simulator: tap a strip photo, viewer opens on that photo; swipe walks the full gallery; tap the title, no viewer.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/modules/photo-masonry/ios/Pages/GalleryDetailController.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/ExploreDirectoryController.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/FollowingGalleriesController.swift \
  apps/mobile/modules/photo-masonry/ios/Pages/GalleryTimelineController.swift
git commit -m "feat(mobile): open subscribed photos on the focused gallery image"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Journal Timeline, local day of `syncedAt` | 1, 4, 8 |
| 30-day window, 12-cap, `nextCursor` inside the window | 1, 4, 8 |
| Invalid timeZone → 400 | 4 |
| Thick `GET /gallery-subscriptions`, empty/ineligible dropped, 6 recents | 3 |
| `photo_asset (tenant_id, synced_at)` index | 4 |
| Segments + default policy + no remember last | 5, 8 |
| Explore restyle + cover limit 6 | 6 |
| Following swipe unsubscribe, banner, no subscribe button | 8 |
| Empty states (no subs vs no recent) | 5, 8 |
| `focusPhotoID`, missing id → gallery only | 9 |
| Subscribe refreshes list + timeline | 9 |
| Visitor has no segments | 8 |
| No masonry Timeline, no fifth tab, no `dateTaken` | honored throughout |

No TBD left. Types (`GalleryPhotoPreview`, `ExploreSegment`, `TimelineEmptyKind`) are named the same in later tasks as in Task 1/5.
