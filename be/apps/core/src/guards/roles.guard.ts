import type { HttpContextAuth } from '@core/context/http-context.values'
import { applyTenantIsolationContext } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { logger } from '@core/helpers/logger.helper'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import type { CanActivate, ExecutionContext } from '@tsuki-hono/common'
import { HttpContext } from '@tsuki-hono/common'
import { injectable } from 'tsyringe'

import { WorkspaceMembershipService } from '../modules/platform/auth/workspace-membership.service'
import type { AuthorizationRequirements } from './authorization.policy'
import { evaluateAuthorization, hasAuthorizationRequirements } from './authorization.policy'
import { getPlatformRoles, getTenantRoles, isAuthRequired } from './roles.decorator'

@injectable()
export class RolesGuard implements CanActivate {
  private readonly log = logger.extend('AuthorizationGuard')

  constructor(private readonly memberships: WorkspaceMembershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler()
    const targetClass = context.getClass()
    const requirements = this.resolveRequirements(handler, targetClass)
    if (!hasAuthorizationRequirements(requirements)) {
      return true
    }

    const store = context.getContext()
    const method = store?.hono?.req?.method ?? 'UNKNOWN'
    const path = store?.hono?.req?.path ?? 'UNKNOWN'
    const authContext = HttpContext.getValue('auth') as HttpContextAuth | undefined
    const platformRole = (authContext?.user as { role?: string } | undefined)?.role
    let membership: Awaited<ReturnType<WorkspaceMembershipService['findMembership']>> = null
    if (requirements.tenantRoles.length > 0) {
      const tenant = requireTenantContext()
      if (authContext?.user) {
        membership = await this.memberships.findMembership(authContext.user.id, tenant.tenant.id)
      }
    }

    const decision = evaluateAuthorization(requirements, {
      authenticated: Boolean(authContext?.user && authContext.session),
      platformRole,
      membership,
    })
    if (!decision.allowed) {
      if (decision.reason === 'unauthenticated') {
        this.log.warn(`Denied access: missing global session for ${method} ${path}`)
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
      }

      const userId = authContext?.user?.id ?? 'anonymous'
      const tenantReason =
        requirements.tenantRoles.length > 0
          ? `membership=${membership ? `${membership.role}:${membership.status}` : 'none'}`
          : `platform role=${platformRole ?? 'n/a'}`
      this.deny(userId, method, path, tenantReason)
    }

    if (requirements.platformRoles.length > 0 && platformRole === 'superadmin') {
      await applyTenantIsolationContext({ isSuperAdmin: true })
    }

    if (membership) {
      HttpContext.assign({ membership })
    }

    return true
  }

  private resolveRequirements(
    handler: ReturnType<ExecutionContext['getHandler']>,
    targetClass: object,
  ): AuthorizationRequirements {
    const handlerPlatformRoles = getPlatformRoles(handler)
    const handlerTenantRoles = getTenantRoles(handler)

    return {
      authRequired: isAuthRequired(handler) || isAuthRequired(targetClass),
      platformRoles: handlerPlatformRoles.length > 0 ? handlerPlatformRoles : getPlatformRoles(targetClass),
      tenantRoles: handlerTenantRoles.length > 0 ? handlerTenantRoles : getTenantRoles(targetClass),
    }
  }

  private deny(userId: string, method: string, path: string, reason: string): never {
    const message = `Insufficient permissions for user ${userId}: ${reason} on ${method} ${path}`
    this.log.warn(message)
    throw new BizException(ErrorCode.AUTH_FORBIDDEN, { message })
  }
}
