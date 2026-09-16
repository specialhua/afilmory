import { describe, expect, it } from 'vitest'

import { evaluateGallerySubscription } from './gallery-subscription.policy'

const publicGallery = {
  banned: false,
  slug: 'street-photography',
  status: 'active',
}

describe('gallery subscription eligibility', () => {
  it('allows a platform user to subscribe without joining the target workspace', () => {
    expect(evaluateGallerySubscription(publicGallery, false)).toEqual({ allowed: true })
  })

  it('keeps workspace membership separate from gallery subscriptions', () => {
    expect(evaluateGallerySubscription(publicGallery, true)).toEqual({
      allowed: false,
      reason: 'own-gallery',
    })
  })

  it.each([
    null,
    { ...publicGallery, banned: true },
    { ...publicGallery, status: 'inactive' },
    { ...publicGallery, slug: 'root' },
    { ...publicGallery, slug: 'placeholder' },
  ])('does not expose unavailable galleries as subscription targets', (target) => {
    expect(evaluateGallerySubscription(target, false)).toEqual({
      allowed: false,
      reason: 'unavailable-gallery',
    })
  })
})
