import { describe, expect, it } from 'vitest'

import type { AuthorizationRequirements } from './authorization.policy'
import { evaluateAuthorization } from './authorization.policy'

const publicRoute: AuthorizationRequirements = {
  authRequired: false,
  platformRoles: [],
  tenantRoles: [],
}

const authenticatedRoute: AuthorizationRequirements = {
  authRequired: true,
  platformRoles: [],
  tenantRoles: [],
}

const workspaceAdminRoute: AuthorizationRequirements = {
  authRequired: false,
  platformRoles: [],
  tenantRoles: ['admin'],
}

const workspaceOwnerRoute: AuthorizationRequirements = {
  authRequired: false,
  platformRoles: [],
  tenantRoles: ['owner'],
}

const platformAdminRoute: AuthorizationRequirements = {
  authRequired: false,
  platformRoles: ['superadmin'],
  tenantRoles: [],
}

describe('evaluateAuthorization', () => {
  it('keeps public routes accessible without a global session', () => {
    expect(evaluateAuthorization(publicRoute, { authenticated: false })).toEqual({ allowed: true })
  })

  it('allows globally authenticated social actions without a workspace membership', () => {
    expect(
      evaluateAuthorization(authenticatedRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: null,
      }),
    ).toEqual({ allowed: true })
  })

  it('denies a workspace route when the global user is not a member of the requested workspace', () => {
    expect(
      evaluateAuthorization(workspaceAdminRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: null,
      }),
    ).toEqual({ allowed: false, reason: 'workspace-membership' })
  })

  it('does not grant implicit workspace access to a platform superadmin', () => {
    expect(
      evaluateAuthorization(workspaceAdminRoute, {
        authenticated: true,
        platformRole: 'superadmin',
        membership: null,
      }),
    ).toEqual({ allowed: false, reason: 'workspace-membership' })
  })

  it('rejects suspended memberships regardless of role', () => {
    expect(
      evaluateAuthorization(workspaceAdminRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: { role: 'owner', status: 'suspended' },
      }),
    ).toEqual({ allowed: false, reason: 'workspace-membership' })
  })

  it('allows an owner to perform workspace administration', () => {
    expect(
      evaluateAuthorization(workspaceAdminRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: { role: 'owner', status: 'active' },
      }),
    ).toEqual({ allowed: true })
  })

  it('does not allow an admin to perform owner-only operations', () => {
    expect(
      evaluateAuthorization(workspaceOwnerRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: { role: 'admin', status: 'active' },
      }),
    ).toEqual({ allowed: false, reason: 'workspace-membership' })
  })

  it('keeps platform administration independent from workspace membership', () => {
    expect(
      evaluateAuthorization(platformAdminRoute, {
        authenticated: true,
        platformRole: 'superadmin',
        membership: null,
      }),
    ).toEqual({ allowed: true })

    expect(
      evaluateAuthorization(platformAdminRoute, {
        authenticated: true,
        platformRole: 'user',
        membership: { role: 'owner', status: 'active' },
      }),
    ).toEqual({ allowed: false, reason: 'platform-role' })
  })
})
