import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
