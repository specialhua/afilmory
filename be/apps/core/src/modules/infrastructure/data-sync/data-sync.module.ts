import { BuilderConfigService } from '@core/modules/configuration/builder-config/builder-config.service'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { ManifestSyncModule } from '@core/modules/content/manifest-sync/manifest-sync.module'
import { BillingModule } from '@core/modules/platform/billing/billing.module'
import { PushNotificationModule } from '@core/modules/platform/push-notifications/push-notification.module'
import { Module } from '@tsuki-hono/common'

import { DataSyncController } from './data-sync.controller'
import { DataSyncService } from './data-sync.service'

@Module({
  imports: [SystemSettingModule, BillingModule, PushNotificationModule, ManifestSyncModule],
  controllers: [DataSyncController],
  providers: [DataSyncService, BuilderConfigService],
})
export class DataSyncModule {}
