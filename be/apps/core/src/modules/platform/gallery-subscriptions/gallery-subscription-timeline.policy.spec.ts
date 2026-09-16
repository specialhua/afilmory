import { describe, expect, it } from 'vitest'

import type { TimelinePhotoInput } from './gallery-subscription-timeline.policy'
import {
  clusterTimelineEvents,
  decodeTimelineCursor,
  encodeTimelineCursor,
  isValidTimeZone,
  TIMELINE_PHOTO_CAP,
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
      photos: [photo('t1', 'a', '2026-08-19T03:00:00.000Z'), photo('t1', 'b', '2026-08-19T06:00:00.000Z')],
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
      photos: [photo('t1', 'before', '2026-08-18T14:30:00.000Z'), photo('t1', 'after', '2026-08-18T15:30:00.000Z')],
      timeZone: 'Asia/Tokyo',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 20,
    })
    expect(events.map(event => event.day)).toEqual(['2026-08-19', '2026-08-18'])
    expect(events).toHaveLength(2)
  })

  it('orders two tenants on the same day by latestAt desc', () => {
    const { events } = clusterTimelineEvents({
      photos: [photo('t1', 'old', '2026-08-19T01:00:00.000Z'), photo('t2', 'new', '2026-08-19T04:00:00.000Z')],
      timeZone: 'UTC',
      now: new Date('2026-08-19T12:00:00.000Z'),
      limit: 20,
    })
    expect(events.map(event => event.tenantId)).toEqual(['t2', 't1'])
  })

  it('drops photos older than 30 days', () => {
    const { events } = clusterTimelineEvents({
      photos: [photo('t1', 'fresh', '2026-08-10T00:00:00.000Z'), photo('t1', 'stale', '2026-07-01T00:00:00.000Z')],
      timeZone: 'UTC',
      now: new Date('2026-08-19T00:00:00.000Z'),
      limit: 20,
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.photos.map(item => item.id)).toEqual(['fresh'])
  })

  it('caps photos at 12 and keeps totalCount', () => {
    const photos = Array.from({ length: 15 }, (_, index) =>
      photo('t1', `p${index}`, new Date(Date.UTC(2026, 7, 19, index)).toISOString()))
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
      photo(tenantId, tenantId, new Date(Date.UTC(2026, 7, 19, 10 - index)).toISOString()))
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
