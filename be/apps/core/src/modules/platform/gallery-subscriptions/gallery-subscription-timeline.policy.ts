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
  }
  catch {
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
    if (typeof parsed.latestAt === 'string' && typeof parsed.tenantId === 'string' && typeof parsed.day === 'string') {
      return { latestAt: parsed.latestAt, tenantId: parsed.tenantId, day: parsed.day }
    }
    return null
  }
  catch {
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
    }
    else {
      grouped.set(key, [photo])
    }
  }

  const events = Array.from(grouped.entries(), ([key, items]) => {
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
  const nextCursor
    = events.length > input.limit && last
      ? encodeTimelineCursor({ latestAt: last.latestAt, tenantId: last.tenantId, day: last.day })
      : null

  return { events: page, nextCursor }
}
