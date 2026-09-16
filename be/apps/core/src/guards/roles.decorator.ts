import { applyDecorators } from '@tsuki-hono/common'

import type { WorkspaceMembershipRole } from '../modules/platform/auth/workspace-membership.service'

export const AUTH_REQUIRED_METADATA = Symbol.for('core.auth.required')
export const PLATFORM_ROLES_METADATA = Symbol.for('core.auth.platform_roles')
export const TENANT_ROLES_METADATA = Symbol.for('core.auth.tenant_roles')

export type PlatformRole = 'user' | 'superadmin'

function defineMetadataDecorator<T>(key: symbol, value: T): MethodDecorator & ClassDecorator {
  return applyDecorators((target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const targetForMetadata = descriptor?.value && typeof descriptor.value === 'function' ? descriptor.value : target
    Reflect.defineMetadata(key, value, targetForMetadata)
  })
}

export function RequireAuth(): MethodDecorator & ClassDecorator {
  return defineMetadataDecorator(AUTH_REQUIRED_METADATA, true)
}

export function PlatformRoles(...roles: PlatformRole[]): MethodDecorator & ClassDecorator {
  return defineMetadataDecorator(PLATFORM_ROLES_METADATA, roles)
}

export function TenantRoles(...roles: WorkspaceMembershipRole[]): MethodDecorator & ClassDecorator {
  return defineMetadataDecorator(TENANT_ROLES_METADATA, roles)
}

export function isAuthRequired(target: object): boolean {
  return Reflect.getMetadata(AUTH_REQUIRED_METADATA, target) === true
}

export function getPlatformRoles(target: object): PlatformRole[] {
  return (Reflect.getMetadata(PLATFORM_ROLES_METADATA, target) ?? []) as PlatformRole[]
}

export function getTenantRoles(target: object): WorkspaceMembershipRole[] {
  return (Reflect.getMetadata(TENANT_ROLES_METADATA, target) ?? []) as WorkspaceMembershipRole[]
}

const TENANT_ROLE_RANK: Record<WorkspaceMembershipRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
}

export function tenantRoleSatisfies(
  actualRole: WorkspaceMembershipRole,
  requiredRoles: WorkspaceMembershipRole[],
): boolean {
  if (requiredRoles.length === 0) {
    return true
  }

  const actualRank = TENANT_ROLE_RANK[actualRole]
  return requiredRoles.some((requiredRole) => actualRank >= TENANT_ROLE_RANK[requiredRole])
}
