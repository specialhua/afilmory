import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { SettingController } from './setting.controller'
import { SettingService } from './setting.service'

@Module({
  imports: [DatabaseModule],
  providers: [SettingService],
  controllers: [SettingController],
})
export class SettingModule {}
