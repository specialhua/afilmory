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
