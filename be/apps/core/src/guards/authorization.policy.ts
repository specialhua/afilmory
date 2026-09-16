import type {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
} from '../modules/platform/auth/workspace-membership.service'
import type { PlatformRole } from './roles.decorator'
import { tenantRoleSatisfies } from './roles.decorator'

export interface AuthorizationRequirements {
  authRequired: boolean
  platformRoles: PlatformRole[]
  tenantRoles: WorkspaceMembershipRole[]
}

export interface AuthorizationSubject {
  authenticated: boolean
  platformRole?: string | null
  membership?: {
    role: WorkspaceMembershipRole
    status: WorkspaceMembershipStatus
  } | null
}

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false
      reason: 'unauthenticated' | 'platform-role' | 'workspace-membership'
    }

export function hasAuthorizationRequirements(requirements: AuthorizationRequirements): boolean {
  return requirements.authRequired || requirements.platformRoles.length > 0 || requirements.tenantRoles.length > 0
}

export function evaluateAuthorization(
  requirements: AuthorizationRequirements,
  subject: AuthorizationSubject,
): AuthorizationDecision {
  if (!hasAuthorizationRequirements(requirements)) {
    return { allowed: true }
  }

  if (!subject.authenticated) {
    return { allowed: false, reason: 'unauthenticated' }
  }

  if (
    requirements.platformRoles.length > 0 &&
    !requirements.platformRoles.includes(subject.platformRole as PlatformRole)
  ) {
    return { allowed: false, reason: 'platform-role' }
  }

  if (requirements.tenantRoles.length > 0) {
    if (
      !subject.membership ||
      subject.membership.status !== 'active' ||
      !tenantRoleSatisfies(subject.membership.role, requirements.tenantRoles)
    ) {
      return { allowed: false, reason: 'workspace-membership' }
    }
  }

  return { allowed: true }
}
