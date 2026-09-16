import { describe, expect, it } from 'vitest'

import { resolveRegistrationStorageDefaults } from './auth-registration-storage.policy'

describe('registration storage defaults', () => {
  it('activates the free managed plan when the platform provider is available', () => {
    const defaults = resolveRegistrationStorageDefaults({
      id: 'managed-b2',
      name: 'Managed B2',
      type: 'b2',
      config: {},
    })

    expect(defaults).toEqual({
      activeProvider: 'managed',
      storagePlanId: 'managed-1gb',
    })
  })

  it('does not provision an unusable managed plan when no provider is configured', () => {
    expect(resolveRegistrationStorageDefaults(null)).toBeNull()
  })
})
