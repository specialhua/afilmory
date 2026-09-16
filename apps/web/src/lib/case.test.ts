import assert from 'node:assert/strict'

import { it } from 'vitest'

import { canAccessDashboard } from './api/auth'
import { camelCaseKeys } from './case'

it('camelCaseKeys converts nested snake_case keys', () => {
  assert.deepEqual(
    camelCaseKeys({
      requested_membership: { id: 'm1', role: 'owner', status: 'active' },
      next_cursor: null,
    }),
    {
      requestedMembership: { id: 'm1', role: 'owner', status: 'active' },
      nextCursor: null,
    },
  )
})

it('camelCaseKeys leaves camelCase payloads unchanged', () => {
  const payload = {
    requestedMembership: { id: 'm1', role: 'admin', status: 'active' },
  }

  assert.deepEqual(camelCaseKeys(payload), payload)
})

it('camelCaseKeys restores dashboard membership from the session API payload', () => {
  const session = camelCaseKeys<{
    user: { role: string }
    requestedMembership: { id: string, role: 'owner', status: 'active' }
  }>({
    user: { role: 'user' },
    requested_membership: { id: 'm1', role: 'owner', status: 'active' },
  })

  assert.equal(canAccessDashboard(session), true)
})
