import 'reflect-metadata'

import type { TenantContext } from '@core/modules/platform/tenant/tenant.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StaticControllerUtils } from './static-controller.utils'

const { getTenantContext } = vi.hoisted(() => ({
  getTenantContext: vi.fn<() => TenantContext | null>(),
}))

vi.mock('@core/modules/platform/tenant/tenant.context', () => ({
  getTenantContext,
  isPlaceholderTenantContext: (context: TenantContext | null) => context?.isPlaceholder === true,
}))

function createTenantContext(slug: string, isPlaceholder = false): TenantContext {
  return {
    isPlaceholder,
    requestedSlug: slug,
    tenant: {
      banned: false,
      createdAt: '2026-08-06T00:00:00.000Z',
      id: `tenant-${slug}`,
      name: slug,
      planId: 'free',
      slug,
      status: isPlaceholder ? 'pending' : 'active',
      storagePlanId: null,
      updatedAt: '2026-08-06T00:00:00.000Z',
    },
  }
}

describe('reserved tenant routing', () => {
  beforeEach(() => {
    getTenantContext.mockReset()
  })

  it('allows an administratively provisioned active tenant with a reserved slug', () => {
    getTenantContext.mockReturnValue(createTenantContext('demo'))

    expect(StaticControllerUtils.isReservedTenant({ root: true })).toBe(false)
    expect(StaticControllerUtils.shouldRenderTenantRestrictedPage()).toBe(false)
  })

  it('continues to restrict a reserved slug before the tenant is activated', () => {
    getTenantContext.mockReturnValue(createTenantContext('demo', true))

    expect(StaticControllerUtils.isReservedTenant({ root: true })).toBe(true)
    expect(StaticControllerUtils.shouldRenderTenantRestrictedPage()).toBe(true)
  })

  it('preserves the root tenant routing boundary', () => {
    getTenantContext.mockReturnValue(createTenantContext('root'))

    expect(StaticControllerUtils.isReservedTenant({ root: true })).toBe(true)
    expect(StaticControllerUtils.isReservedTenant({ root: false })).toBe(false)
  })
})
