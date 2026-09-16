import { admin } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'

import { AUTH_ADMIN_PLUGIN_OPTIONS } from './auth-admin.policy'

describe('admin plugin options', () => {
  it('registers the platform superadmin role with Better Auth admin permissions', () => {
    const plugin = admin(AUTH_ADMIN_PLUGIN_OPTIONS)

    expect(plugin.id).toBe('admin')
    expect(
      AUTH_ADMIN_PLUGIN_OPTIONS.roles.superadmin.authorize({
        session: ['revoke'],
        user: ['list'],
      }),
    ).toEqual({ success: true })
    expect(AUTH_ADMIN_PLUGIN_OPTIONS.roles.user.authorize({ user: ['list'] }).success).toBe(false)
  })
})
