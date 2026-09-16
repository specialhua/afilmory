import { coreApi } from '~/lib/api-client'
import { camelCaseKeys } from '~/lib/case'

import type { BetterAuthSession, BetterAuthUser } from '../types'

export interface SessionWorkspace {
  id: string
  slug: string | null
  name: string
  status: string
  planId?: string
  storagePlanId?: string | null
  isPlaceholder?: boolean
  requestedSlug?: string | null
}

export type WorkspaceRole = 'member' | 'admin' | 'owner'
export type WorkspaceMembershipStatus = 'active' | 'suspended'

export interface SessionMembership {
  id: string
  role: WorkspaceRole
  status: WorkspaceMembershipStatus
  workspace: SessionWorkspace
}

export type SessionResponse = {
  user: BetterAuthUser
  session: BetterAuthSession
  activeWorkspace: SessionWorkspace | null
  requestedWorkspace: SessionWorkspace | null
  requestedMembership: Omit<SessionMembership, 'workspace'> | null
  memberships: SessionMembership[]
}

export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const

export async function fetchSession(): Promise<SessionResponse | null> {
  const session = await coreApi<SessionResponse | null>('/auth/session', { method: 'GET' })
  return session ? camelCaseKeys<SessionResponse>(session) : null
}

export async function switchWorkspace(tenantId: string) {
  return camelCaseKeys<{ activeWorkspace: SessionWorkspace, membership: SessionMembership }>(
    await coreApi('/auth/workspaces/switch', {
      method: 'POST',
      body: { tenantId },
    }),
  )
}
