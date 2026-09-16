import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { AUTH_SESSION_QUERY_KEY, fetchSession, switchWorkspace } from '~/modules/auth/api/session'
import { buildTenantUrl } from '~/modules/auth/utils/domain'

export function WorkspaceSwitcher() {
  const queryClient = useQueryClient()
  const [switching, setSwitching] = useState(false)
  const { data: session } = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
  })

  const memberships
    = session?.memberships.filter(
      membership =>
        membership.status === 'active'
        && membership.workspace.status === 'active'
        && (membership.role === 'admin' || membership.role === 'owner'),
    ) ?? []
  if (memberships.length <= 1) {
    return null
  }

  const selectedWorkspace = session?.requestedMembership ? session.requestedWorkspace : session?.activeWorkspace

  const handleChange = async (tenantId: string) => {
    const target = memberships.find(membership => membership.workspace.id === tenantId)
    if (!target?.workspace.slug || switching) {
      return
    }

    setSwitching(true)
    try {
      await switchWorkspace(tenantId)
      await queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
      window.location.assign(buildTenantUrl(target.workspace.slug, '/'))
    }
    catch (error) {
      toast.error('Unable to switch workspace', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
    finally {
      setSwitching(false)
    }
  }

  return (
    <label className="hidden items-center md:flex">
      <span className="sr-only">Workspace</span>
      <select
        aria-label="Workspace"
        className="bg-fill/20 text-text hover:bg-fill/40 max-w-48 rounded border border-fill-tertiary/40 px-2 py-1 text-xs font-medium outline-none transition disabled:opacity-50"
        disabled={switching}
        value={selectedWorkspace?.id ?? ''}
        onChange={event => void handleChange(event.target.value)}
      >
        {memberships.map(({ role, workspace }) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
            {' '}
            ·
            {role}
          </option>
        ))}
      </select>
    </label>
  )
}
