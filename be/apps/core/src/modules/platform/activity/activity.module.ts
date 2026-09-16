import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { ActivityService } from './activity.service'

@Module({
  imports: [DatabaseModule],
  providers: [ActivityService],
})
export class ActivityModule {}
