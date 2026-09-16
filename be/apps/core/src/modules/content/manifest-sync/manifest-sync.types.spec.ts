import { describe, expect, it } from 'vitest'

import {
  isChangeCursorExpired,
  isPublishedSyncStatus,
  parseRevisionETag,
  revisionETag,
  toPhotoChange,
} from './manifest-sync.types'

describe('revisionETag', () => {
  it('encodes a strong revision token', () => {
    expect(revisionETag(0)).toBe('"rev-0"')
    expect(revisionETag(12)).toBe('"rev-12"')
  })

  it('round-trips through parseRevisionETag', () => {
    expect(parseRevisionETag(revisionETag(41))).toBe(41)
    expect(parseRevisionETag('"hash-not-revision"')).toBeNull()
    expect(parseRevisionETag(undefined)).toBeNull()
  })
})

describe('isChangeCursorExpired', () => {
  it('keeps a zero cursor live so bootstrap can read retained history', () => {
    expect(isChangeCursorExpired(0, 8)).toBe(false)
    expect(isChangeCursorExpired(0, null)).toBe(false)
  })

  it('expires when the retained window no longer contains the next revision', () => {
    expect(isChangeCursorExpired(3, 5)).toBe(true)
    expect(isChangeCursorExpired(4, 5)).toBe(false)
    expect(isChangeCursorExpired(12, null)).toBe(true)
  })
})

describe('isPublishedSyncStatus', () => {
  it('publishes synced and conflict rows only', () => {
    expect(isPublishedSyncStatus('synced')).toBe(true)
    expect(isPublishedSyncStatus('conflict')).toBe(true)
    expect(isPublishedSyncStatus('pending')).toBe(false)
  })
})

describe('toPhotoChange', () => {
  it('copies payload fields onto the wire change', () => {
    const change = toPhotoChange({
      tenantId: 'tenant-1',
      revision: 3,
      payload: {
        operation: 'upsert',
        photoId: 'photo-1',
        assetId: 'asset-1',
        published: true,
        photo: { id: 'photo-1' } as never,
        asset: {
          id: 'asset-1',
          photoId: 'photo-1',
          storageKey: 'a.jpg',
          storageProvider: 's3',
          syncStatus: 'synced',
          size: 12,
          createdAt: '2026-08-29T00:00:00.000Z',
          updatedAt: '2026-08-29T00:00:00.000Z',
          syncedAt: '2026-08-29T00:00:00.000Z',
          publicUrl: 'https://example.test/a.jpg',
        },
      },
    })

    expect(change).toMatchObject({
      tenantId: 'tenant-1',
      revision: 3,
      operation: 'upsert',
      photoId: 'photo-1',
      assetId: 'asset-1',
      published: true,
    })
  })
})
