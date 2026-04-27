import { isTenantSlugReserved } from '@afilmory/utils'
import { BizException, ErrorCode } from '@core/errors'
import { ROOT_TENANT_SLUG } from '@core/modules/platform/tenant/tenant.constants'
import { getTenantContext, isPlaceholderTenantContext } from '@core/modules/platform/tenant/tenant.context'

import type { StaticDashboardService } from './static-dashboard.service'
import { STATIC_DASHBOARD_BASENAME } from './static-dashboard.service'

const TENANT_MISSING_ENTRY_PATH = `${STATIC_DASHBOARD_BASENAME}/tenant-missing.html`
const TENANT_RESTRICTED_ENTRY_PATH = `${STATIC_DASHBOARD_BASENAME}/tenant-restricted.html`
const TENANT_SUSPENDED_ENTRY_PATH = `${STATIC_DASHBOARD_BASENAME}/tenant-suspended.html`

export const StaticControllerUtils = {
  cloneResponseWithStatus(response: Response, status: number): Response {
    const headers = new Headers(response.headers)
    return new Response(response.body, {
      status,
      headers,
    })
  },

  isReservedTenant({ root = false }: { root?: boolean } = {}): boolean {
    const tenantContext = getTenantContext()
    if (!tenantContext) {
      return false
    }

    const tenantSlug = tenantContext.tenant.slug?.toLowerCase() ?? null
    if (tenantSlug === ROOT_TENANT_SLUG) {
      return !!root
    }

    const requestedSlug = tenantContext.requestedSlug?.toLowerCase() ?? null

    if (isPlaceholderTenantContext(tenantContext)) {
      if (!requestedSlug) {
        return false
      }
      const candidate = requestedSlug ?? tenantSlug
      return isTenantSlugReserved(candidate)
    }

    if (!tenantSlug) {
      return false
    }

    return isTenantSlugReserved(tenantSlug)
  },

  shouldRenderTenantRestrictedPage(): boolean {
    return StaticControllerUtils.isReservedTenant({ root: true })
  },

  shouldRenderTenantSuspendedPage(): boolean {
    const tenantContext = getTenantContext()
    if (!tenantContext) {
      return false
    }
    return tenantContext.tenant.banned || tenantContext.tenant.status === 'suspended'
  },

  shouldRenderTenantMissingPage(): boolean {
    const tenantContext = getTenantContext()
    if (!tenantContext) {
      return true
    }

    if (tenantContext.tenant.banned || tenantContext.tenant.status === 'suspended') {
      return false
    }

    return isPlaceholderTenantContext(tenantContext)
  },

  async renderTenantMissingPage(dashboardService: StaticDashboardService): Promise<Response> {
    const response = await dashboardService.handleRequest(TENANT_MISSING_ENTRY_PATH, false)
    if (response) {
      return StaticControllerUtils.cloneResponseWithStatus(response, 404)
    }

    throw new BizException(ErrorCode.COMMON_NOT_FOUND, {
      message: 'Workspace unavailable',
    })
  },

  async renderTenantRestrictedPage(dashboardService: StaticDashboardService): Promise<Response> {
    const response = await dashboardService.handleRequest(TENANT_RESTRICTED_ENTRY_PATH, false)
    if (response) {
      return StaticControllerUtils.cloneResponseWithStatus(response, 403)
    }

    throw new BizException(ErrorCode.COMMON_FORBIDDEN, {
      message: 'Workspace access restricted',
    })
  },

  async renderTenantSuspendedPage(dashboardService: StaticDashboardService): Promise<Response> {
    const response = await dashboardService.handleRequest(TENANT_SUSPENDED_ENTRY_PATH, false)
    if (response) {
      return StaticControllerUtils.cloneResponseWithStatus(response, 403)
    }

    throw new BizException(ErrorCode.COMMON_FORBIDDEN, {
      message: 'Workspace suspended',
    })
  },

  async ensureTenantAvailable(dashboardService: StaticDashboardService): Promise<Response | null> {
    if (StaticControllerUtils.shouldRenderTenantRestrictedPage()) {
      return await StaticControllerUtils.renderTenantRestrictedPage(dashboardService)
    }
    if (StaticControllerUtils.shouldRenderTenantSuspendedPage()) {
      return await StaticControllerUtils.renderTenantSuspendedPage(dashboardService)
    }
    if (StaticControllerUtils.shouldRenderTenantMissingPage()) {
      return await StaticControllerUtils.renderTenantMissingPage(dashboardService)
    }
    return null
  },
}
