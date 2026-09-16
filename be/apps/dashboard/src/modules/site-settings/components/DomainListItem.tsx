import { Button, FormHelperText } from '@afilmory/ui'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import type { TenantDomain } from '../types'
import { DomainBadge } from './DomainBadge'

interface DomainListItemProps {
  domain: TenantDomain
  cnameTarget: string
  onVerify: (id: string) => void
  onDelete: (id: string) => void
  isVerifying: boolean
  isDeleting: boolean
}

export function DomainListItem({
  domain,
  cnameTarget,
  onVerify,
  onDelete,
  isVerifying,
  isDeleting,
}: DomainListItemProps) {
  const { t } = useTranslation()

  return (
    <LinearBorderPanel className="bg-background p-4 transition-all duration-200 hover:bg-fill/30">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between">
            <span className="text-sm font-semibold text-text break-all min-w-0 truncate">{domain.domain}</span>
            <Button
              variant="text"
              size="sm"
              onClick={() => onDelete(domain.id)}
              disabled={isDeleting}
              className="text-text-tertiary hover:text-red shrink-0 ml-2"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
              <DomainBadge status={domain.status} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {domain.status === 'pending' ? (
                <Button variant="text" size="sm" onClick={() => onVerify(domain.id)} isLoading={isVerifying}>
                  {t('settings.domain.actions.verify')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {domain.status !== 'verified' ? (
          <LinearBorderPanel className="bg-fill/50 p-3">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                {t('settings.domain.dns.cname.title')}
              </p>
              <div className="space-y-2 rounded-lg border border-fill bg-background p-3">
                <KeyValueRow label={t('settings.domain.dns.type')} value="CNAME" />
                <KeyValueRow label={t('settings.domain.dns.name')} value={domain.domain} copyable monospace />
                <KeyValueRow
                  label={t('settings.domain.dns.value')}
                  value={cnameTarget}
                  copyable
                  monospace
                  copyLabel={t('settings.domain.actions.copy')}
                />
                <KeyValueRow label={t('settings.domain.dns.ttl')} value={t('settings.domain.dns.hint.ttl')} />
                <FormHelperText className="text-xs text-text-tertiary">
                  {t('settings.domain.dns.cname.helper')}
                </FormHelperText>
              </div>

              <div className="space-y-2 rounded-lg border border-fill bg-background p-3">
                <KeyValueRow
                  label={t('settings.domain.provider.hostname')}
                  value={domain.hostnameStatus ?? 'unknown'}
                  monospace
                />
                <KeyValueRow
                  label={t('settings.domain.provider.ssl')}
                  value={domain.sslStatus ?? 'unknown'}
                  monospace
                />
              </div>

              {domain.verificationErrors.length > 0 ? (
                <div className="rounded-lg border border-red/30 bg-red/10 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red">
                    {t('settings.domain.provider.errors')}
                  </p>
                  <ul className="space-y-1 text-xs text-text-secondary">
                    {domain.verificationErrors.map(error => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </LinearBorderPanel>
        ) : null}
      </div>
    </LinearBorderPanel>
  )
}

function KeyValueRow({
  label,
  value,
  monospace,
  copyable,
  copyLabel,
}: {
  label: string
  value: string
  monospace?: boolean
  copyable?: boolean
  copyLabel?: string
}) {
  const common = 'text-sm text-text'
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-text-tertiary">{label}</span>
      <div className="flex-1 truncate">
        <span className={monospace ? `${common} font-mono break-all` : common}>{value}</span>
      </div>
      {copyable ? <CopyButton value={value} label={copyLabel} /> : null}
    </div>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string, label?: string }) {
  return (
    <Button
      variant="text"
      size="xs"
      onClick={() => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(value)
        }
      }}
    >
      {label}
    </Button>
  )
}
