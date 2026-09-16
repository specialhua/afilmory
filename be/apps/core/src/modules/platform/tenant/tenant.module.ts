import './tenant.context'

import { DatabaseModule } from '@core/database/database.module'
import { AppStateModule } from '@core/modules/app/app-state/app-state.module'
import { SystemSettingModule } from '@core/modules/configuration/system-setting/system-setting.module'
import { CloudflareModule } from '@core/modules/infrastructure/cloudflare/cloudflare.module'
import { BillingModule } from '@core/modules/platform/billing/billing.module'
import { Module } from '@tsuki-hono/common'

import { TenantController } from './tenant.controller'
import { TenantRepository } from './tenant.repository'
import { TenantService } from './tenant.service'
import { TenantContextResolver } from './tenant-context-resolver.service'
import { TenantDomainRepository } from './tenant-domain.repository'
import { TenantDomainService } from './tenant-domain.service'

@Module({
  imports: [DatabaseModule, AppStateModule, SystemSettingModule, CloudflareModule, BillingModule],
  controllers: [TenantController],
  providers: [TenantRepository, TenantDomainRepository, TenantService, TenantDomainService, TenantContextResolver],
})
export class TenantModule {}
