import { PlatformRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { parseStorageProviders } from '@core/modules/configuration/setting/storage-provider.utils'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import type { UpdateSystemSettingsInput } from '@core/modules/configuration/system-setting/system-setting.types'
import { Body, Controller, Get, Patch } from '@tsuki-hono/common'

import { UpdateSuperAdminSettingsDto } from './super-admin.dto'
import { SuperAdminAuditService } from './super-admin-audit.service'

@Controller('super-admin/settings')
@PlatformRoles('superadmin')
export class SuperAdminSettingController {
  constructor(
    private readonly systemSettings: SystemSettingService,
    private readonly audit: SuperAdminAuditService,
  ) {}

  @Get('/')
  @BypassResponseTransform()
  async getOverview() {
    return await this.systemSettings.getOverview()
  }

  @Patch('/')
  @BypassResponseTransform()
  async update(@Body() dto: UpdateSuperAdminSettingsDto) {
    const { managedStorageProviders, ...rest } = dto
    const payload: UpdateSystemSettingsInput = { ...rest }

    if (managedStorageProviders !== undefined) {
      payload.managedStorageProviders = this.normalizeManagedProviders(managedStorageProviders)
    }
    const before = await this.systemSettings.getOverview()

    return await this.audit.run(
      {
        action: 'system-settings.update',
        targetType: 'system-settings',
        targetId: 'global',
        before: { ...before },
      },
      async () => {
        await this.systemSettings.updateSettings(payload)
        return await this.systemSettings.getOverview()
      },
      () => ({ after: { updatedFields: Object.keys(payload) } }),
    )
  }

  private normalizeManagedProviders(
    providers: UpdateSuperAdminSettingsDto['managedStorageProviders'],
  ): UpdateSystemSettingsInput['managedStorageProviders'] {
    try {
      return parseStorageProviders(JSON.stringify(providers ?? []))
    }
    catch {
      return []
    }
  }
}
