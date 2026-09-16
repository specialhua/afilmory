import { BizException, ErrorCode } from '@core/errors'
import { getTenantContext, isPlaceholderTenantContext } from '@core/modules/platform/tenant/tenant.context'
import type { TenantContext } from '@core/modules/platform/tenant/tenant.types'
import type { CanActivate, ExecutionContext } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { isPlaceholderTenantAllowed } from '../decorators/allow-placeholder.decorator'
import { shouldSkipTenant } from '../decorators/skip-tenant.decorator'
import { logger } from '../helpers/logger.helper'

export function isPlaceholderAllowedForRoute(handler: object, targetClass: object): boolean {
  return isPlaceholderTenantAllowed(handler) || isPlaceholderTenantAllowed(targetClass)
}

/**
 * Validates the resource-workspace context only.
 *
 * Authentication and workspace membership are intentionally handled by
 * RolesGuard. A global session may access public and social routes in any
 * resource workspace, regardless of its active workspace selection.
 */
@injectable()
export class AuthGuard implements CanActivate {
  private readonly log = logger.extend('TenantContextGuard')

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const store = context.getContext()
    const { hono } = store
    const { method, path } = hono.req
    const handler = context.getHandler()
    const targetClass = context.getClass()

    if (shouldSkipTenant(handler) || shouldSkipTenant(targetClass)) {
      this.log.verbose(`Skip resource-workspace validation for ${method} ${path}`)
      return true
    }

    const tenantContext = this.requireTenantContext(method, path)
    const placeholderAllowed = isPlaceholderAllowedForRoute(handler, targetClass)
    if (isPlaceholderTenantContext(tenantContext) && !placeholderAllowed) {
      this.log.warn(`Denied access: placeholder workspace cannot access ${method} ${path}`)
      throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
    }

    return true
  }

  private requireTenantContext(method: string, path: string): TenantContext {
    const tenantContext = getTenantContext()
    if (!tenantContext) {
      this.log.warn(`Resource workspace was not resolved for ${method} ${path}`)
      throw new BizException(ErrorCode.AUTH_TENANT_NOT_FOUND_GUARD)
    }
    return tenantContext
  }
}
