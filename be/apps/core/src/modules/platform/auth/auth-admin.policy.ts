import type { AdminOptions } from 'better-auth/plugins/admin'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'

export const AUTH_ADMIN_PLUGIN_OPTIONS = {
  adminRoles: ['superadmin'],
  defaultRole: 'user',
  defaultBanReason: 'Spamming',
  roles: {
    superadmin: adminAc,
    user: userAc,
  },
} satisfies AdminOptions
