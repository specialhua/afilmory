import { evaluateGallerySubscription } from './gallery-subscription.policy'
import type { GalleryPhotoPreview } from './gallery-subscription-timeline.policy'

export const SUBSCRIPTION_RECENT_PHOTO_LIMIT = 6

export type SubscriptionTarget = {
  author: { name: string, avatar: string | null } | null
  banned: boolean
  domain: string | null
  name: string
  slug: string
  status: string
}

export type GallerySubscriptionSummary = {
  createdAt: string
  gallery: {
    author: { name: string, avatar: string | null } | null
    domain: string | null
    id: string
    lastUpload: string
    name: string
    photoCount: number
    slug: string
  }
  recentPhotos: GalleryPhotoPreview[]
  tenantId: string
}

export function assembleSubscriptionSummaries(input: {
  memberTenantIds: Set<string>
  photoCounts?: Record<string, number>
  photos: Record<string, GalleryPhotoPreview[]>
  subscriptions: Array<{ createdAt: string, tenantId: string }>
  targets: Record<string, SubscriptionTarget>
}): GallerySubscriptionSummary[] {
  const rows: GallerySubscriptionSummary[] = []

  for (const subscription of input.subscriptions) {
    const target = input.targets[subscription.tenantId]
    if (!target) {
      continue
    }
    const decision = evaluateGallerySubscription(
      { banned: target.banned, slug: target.slug, status: target.status },
      input.memberTenantIds.has(subscription.tenantId),
    )
    if (!decision.allowed) {
      continue
    }
    const photos = [...(input.photos[subscription.tenantId] ?? [])].sort((left, right) =>
      right.syncedAt.localeCompare(left.syncedAt))
    if (photos.length === 0) {
      continue
    }
    rows.push({
      tenantId: subscription.tenantId,
      createdAt: subscription.createdAt,
      gallery: {
        id: subscription.tenantId,
        name: target.name,
        slug: target.slug,
        domain: target.domain,
        author: target.author,
        photoCount: input.photoCounts?.[subscription.tenantId] ?? photos.length,
        lastUpload: photos[0]!.syncedAt,
      },
      recentPhotos: photos.slice(0, SUBSCRIPTION_RECENT_PHOTO_LIMIT),
    })
  }

  return rows.sort((left, right) => right.gallery.lastUpload.localeCompare(left.gallery.lastUpload))
}
