import type { CloudflareCustomHostname } from '@core/modules/infrastructure/cloudflare/cloudflare-custom-hostname.service'

import type { TenantDomainRecord } from './tenant.types'

const DISABLED_HOSTNAME_STATUSES = new Set([
  'blocked',
  'deleted',
  'moved',
  'pending_blocked',
  'pending_deletion',
  'test_blocked',
  'test_failed',
])

export interface TenantDomainProviderState {
  hostnameStatus: string
  lastSyncedAt: string
  sslStatus: string
  status: TenantDomainRecord['status']
  verificationErrors: string[]
  verifiedAt: string | null
}

export function mapCloudflareDomainState(
  cloudflareHostname: CloudflareCustomHostname,
  syncedAt = new Date().toISOString(),
): TenantDomainProviderState {
  const hostnameStatus = cloudflareHostname.status ?? 'unknown'
  const sslStatus = cloudflareHostname.ssl?.status ?? 'unknown'
  const ready = hostnameStatus === 'active' && sslStatus === 'active'
  const disabled = DISABLED_HOSTNAME_STATUSES.has(hostnameStatus)

  return {
    hostnameStatus,
    sslStatus,
    status: ready ? 'verified' : disabled ? 'disabled' : 'pending',
    verificationErrors: cloudflareHostname.verification_errors ?? [],
    verifiedAt: ready ? syncedAt : null,
    lastSyncedAt: syncedAt,
  }
}
