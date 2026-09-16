export type BetterAuthUserRole = 'user' | 'superadmin'

export interface BetterAuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: BetterAuthUserRole
  creemCustomerId?: string | null
}

export interface BetterAuthSession {
  id: string
  expiresAt: string
  token: string
  userId: string
  activeTenantId: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthState {
  user: BetterAuthUser
  session: BetterAuthSession
}
