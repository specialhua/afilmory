import { Roles } from '@core/guards/roles.decorator'
import { Controller, Get } from '@tsuki-hono/common'

import { DashboardService } from './dashboard.service'

@Controller('dashboard')
@Roles('admin')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  async getOverview() {
    return await this.dashboardService.getOverview()
  }

  @Get('analytics')
  async getAnalytics() {
    return await this.dashboardService.getAnalytics()
  }
}
