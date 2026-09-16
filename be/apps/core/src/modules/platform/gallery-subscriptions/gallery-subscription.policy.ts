export interface GallerySubscriptionTarget {
  banned: boolean
  slug: string
  status: string
}

export type GallerySubscriptionDecision
  = | { allowed: true }
    | { allowed: false, reason: 'own-gallery' | 'unavailable-gallery' }

const RESERVED_GALLERY_SLUGS = new Set(['placeholder', 'root'])

export function evaluateGallerySubscription(
  target: GallerySubscriptionTarget | null,
  hasActiveMembership: boolean,
): GallerySubscriptionDecision {
  if (!target || target.banned || target.status !== 'active' || RESERVED_GALLERY_SLUGS.has(target.slug)) {
    return { allowed: false, reason: 'unavailable-gallery' }
  }

  if (hasActiveMembership) {
    return { allowed: false, reason: 'own-gallery' }
  }

  return { allowed: true }
}
