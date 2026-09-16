import { describe, expect, it } from 'vitest'

import { mapCloudflareDomainState } from './tenant-domain.state'

const syncedAt = '2026-08-06T10:00:00.000Z'

describe('mapCloudflareDomainState', () => {
  it('does not activate a hostname before its certificate is active', () => {
    const state = mapCloudflareDomainState(
      {
        id: 'hostname-id',
        hostname: 'photos.example.com',
        status: 'active',
        ssl: { method: 'http', status: 'pending_validation' },
      },
      syncedAt,
    )

    expect(state.status).toBe('pending')
    expect(state.verifiedAt).toBeNull()
    expect(state.hostnameStatus).toBe('active')
    expect(state.sslStatus).toBe('pending_validation')
  })

  it('activates a hostname only when Cloudflare hostname and SSL states are both active', () => {
    const state = mapCloudflareDomainState(
      {
        id: 'hostname-id',
        hostname: 'photos.example.com',
        status: 'active',
        ssl: { method: 'http', status: 'active' },
      },
      syncedAt,
    )

    expect(state.status).toBe('verified')
    expect(state.verifiedAt).toBe(syncedAt)
  })

  it('disables hostnames Cloudflare has moved away from the SaaS target', () => {
    const state = mapCloudflareDomainState(
      {
        id: 'hostname-id',
        hostname: 'photos.example.com',
        status: 'moved',
        verification_errors: ['custom hostname does not CNAME to this zone.'],
        ssl: { method: 'http', status: 'active' },
      },
      syncedAt,
    )

    expect(state.status).toBe('disabled')
    expect(state.verificationErrors).toEqual(['custom hostname does not CNAME to this zone.'])
  })
})
