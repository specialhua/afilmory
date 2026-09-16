import { Button, FormHelperText, Input } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { Loader2 } from 'lucide-react'
import { m } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { presentBillingUpgradeModal } from '~/modules/billing'

import {
  useDeleteTenantDomainMutation,
  useRequestTenantDomainMutation,
  useTenantDomainsQuery,
  useVerifyTenantDomainMutation,
} from '../hooks'
import { DomainListItem } from './DomainListItem'

function buildVerificationInstructions() {
  return [
    {
      titleKey: 'settings.domain.steps.cname.title',
      descriptionKey: 'settings.domain.steps.cname.desc',
    },
    {
      titleKey: 'settings.domain.steps.verify.title',
      descriptionKey: 'settings.domain.steps.verify.desc',
    },
  ] satisfies {
    titleKey: I18nKeys
    descriptionKey: I18nKeys
  }[]
}

export function CustomDomainCard() {
  const { t } = useTranslation()
  const [domainInput, setDomainInput] = useState('')
  const { data, isLoading, isFetching } = useTenantDomainsQuery()
  const requestDomainMutation = useRequestTenantDomainMutation()
  const verifyMutation = useVerifyTenantDomainMutation()
  const deleteMutation = useDeleteTenantDomainMutation()

  const domains = data?.domains ?? []
  const cnameTarget = data?.cnameTarget ?? '—'
  const customDomainLimit = data?.customDomainLimit
  const steps = useMemo(() => buildVerificationInstructions(), [])

  const handleRequest = async () => {
    const normalizedDomain = domainInput.trim().toLowerCase()
    if (!normalizedDomain) {
      toast.error(t('settings.domain.toast.input-required'))
      return
    }
    if (customDomainLimit === 0) {
      presentBillingUpgradeModal('plan', 'custom-domain')
      return
    }
    const alreadyBound = domains.some(domain => domain.domain.toLowerCase() === normalizedDomain)
    if (!alreadyBound && customDomainLimit != null && domains.length >= customDomainLimit) {
      toast.error(t('settings.domain.toast.limit-reached', { limit: customDomainLimit }))
      return
    }
    requestDomainMutation.mutate(normalizedDomain)
  }

  const pendingDomain = domains.find(item => item.status === 'pending')
  const handleVerify = (domainId: string) => {
    if (customDomainLimit === 0) {
      presentBillingUpgradeModal('plan', 'custom-domain')
      return
    }
    verifyMutation.mutate(domainId)
  }

  return (
    <LinearBorderPanel>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">{t('settings.domain.title')}</p>
          <p className="text-text-secondary text-sm">{t('settings.domain.description')}</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-4">
              <label className="text-sm font-medium text-text">{t('settings.domain.input.label')}</label>
              <Input
                value={domainInput}
                onChange={event => setDomainInput(event.target.value)}
                placeholder={t('settings.domain.input.placeholder')}
                disabled={requestDomainMutation.isPending}
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleRequest}
                  isLoading={requestDomainMutation.isPending}
                  disabled={!domainInput.trim()}
                >
                  {t(customDomainLimit === 0 ? 'settings.domain.input.upgrade-cta' : 'settings.domain.input.cta')}
                </Button>
                <FormHelperText className="text-text-tertiary">{t('settings.domain.input.helper')}</FormHelperText>
              </div>
            </div>

            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {t('settings.domain.steps.title')}
            </p>
            <div className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <m.div
                  key={step.titleKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...Spring.presets.smooth, delay: index * 0.04 }}
                  className="flex gap-3 px-3 py-3"
                >
                  <span className="size-6 rounded-full bg-accent flex items-center justify-center -mt-0.5 text-sm font-semibold text-text">
                    {index + 1}
                  </span>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold text-text">{t(step.titleKey)}</p>
                    <p className="text-text-secondary text-sm">{t(step.descriptionKey, { target: cnameTarget })}</p>
                  </div>
                </m.div>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="mb-4 flex items-center justify-between h-5">
              <p className="text-sm font-semibold text-text">{t('settings.domain.bound-list.title')}</p>
              <div className="h-4 w-4">
                {(isLoading || isFetching) && <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />}
              </div>
            </div>
            {domains.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('settings.domain.bound-list.empty')}</p>
            ) : (
              <div className="space-y-3">
                {domains.map(domain => (
                  <DomainListItem
                    key={domain.id}
                    domain={domain}
                    cnameTarget={cnameTarget}
                    onVerify={handleVerify}
                    onDelete={deleteMutation.mutate}
                    isVerifying={verifyMutation.isPending}
                    isDeleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {pendingDomain ? (
          <LinearBorderPanel className="border-yellow/40 bg-yellow/10 p-3">
            <p className="text-xs text-text">{t('settings.domain.banner.pending', { domain: pendingDomain.domain })}</p>
          </LinearBorderPanel>
        ) : null}
      </div>
    </LinearBorderPanel>
  )
}
