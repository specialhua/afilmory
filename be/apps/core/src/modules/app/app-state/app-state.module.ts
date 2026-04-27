import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { AppStateService } from './app-state.service'

@Module({
  imports: [DatabaseModule],
  providers: [AppStateService],
})
export class AppStateModule {}
