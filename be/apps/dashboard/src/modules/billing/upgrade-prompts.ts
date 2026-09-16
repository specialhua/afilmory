import { Modal } from '@afilmory/ui'

import { getRequestErrorCode, getRequestStatusCode } from '~/lib/errors'
import { ManagedStoragePlansModal } from '~/modules/storage-providers/components/ManagedStoragePlansModal'

import type { BillingPlanUpgradeReason } from './BillingPlanUpgradeModal'
import { BillingPlanUpgradeModal } from './BillingPlanUpgradeModal'

const PLAN_LIMIT_CODE = 40
const STORAGE_LIMIT_CODE = 41

export type BillingUpgradeCategory = 'plan' | 'storage'

export function resolveBillingUpgradeCategory(error: unknown): BillingUpgradeCategory | null {
  const code = getRequestErrorCode(error)
  if (code === PLAN_LIMIT_CODE) {
    return 'plan'
  }
  if (code === STORAGE_LIMIT_CODE) {
    return 'storage'
  }

  const status = getRequestStatusCode(error)
  if (status === 402) {
    return 'plan'
  }

  return null
}

export function presentBillingUpgradeModal(
  category: BillingUpgradeCategory,
  reason: BillingPlanUpgradeReason = 'quota-exceeded',
) {
  if (category === 'storage') {
    Modal.present(ManagedStoragePlansModal, { reason: 'quota-exceeded' }, { dismissOnOutsideClick: true })
    return
  }
  Modal.present(BillingPlanUpgradeModal, { reason }, { dismissOnOutsideClick: true })
}
