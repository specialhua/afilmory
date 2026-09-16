import { TenantRoles } from '@core/guards/roles.decorator'
import { Controller, Delete, Post } from '@tsuki-hono/common'

import { DataManagementService } from './data-management.service'

@Controller('data-management')
@TenantRoles('admin')
export class DataManagementController {
  constructor(private readonly dataManagementService: DataManagementService) {}

  @Post('photo-assets/truncate')
  async truncatePhotoAssetRecords() {
    return await this.dataManagementService.clearPhotoAssetRecords()
  }

  @Delete('account')
  @TenantRoles('owner')
  async deleteTenantAccount() {
    return await this.dataManagementService.deleteTenantAccount()
  }
}
