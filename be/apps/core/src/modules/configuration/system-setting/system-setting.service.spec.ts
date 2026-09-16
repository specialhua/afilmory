import { STORAGE_PLAN_PRODUCTS_SETTING_KEY } from '@core/modules/platform/billing/plan/storage-plan.constants'
import { describe, expect, it, vi } from 'vitest'

import { SystemSettingService } from './system-setting.service'

describe('system setting service', () => {
  it('saves storage products when an optional provider product ID is null', async () => {
    const systemSettingStore = {
      getMany: vi.fn().mockResolvedValue({}),
      setMany: vi.fn().mockResolvedValue(undefined),
    }
    const service = new SystemSettingService(systemSettingStore as never, {} as never)

    await service.updateSettings({
      storagePlanProducts: {
        'managed-5gb': {
          appStoreProductId: null,
          creemProductId: 'prod_5gb',
        },
        'managed-50gb': {
          appStoreProductId: 'app.afilmory.subscription.storage50',
          creemProductId: 'prod_50gb',
        },
      },
    })

    expect(systemSettingStore.setMany).toHaveBeenCalledWith([
      expect.objectContaining({
        key: STORAGE_PLAN_PRODUCTS_SETTING_KEY,
        value: {
          'managed-5gb': {
            appStoreProductId: null,
            creemProductId: 'prod_5gb',
          },
          'managed-50gb': {
            appStoreProductId: 'app.afilmory.subscription.storage50',
            creemProductId: 'prod_50gb',
          },
        },
      }),
    ])
  })
})
