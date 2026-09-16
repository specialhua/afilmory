import { Module } from '@tsuki-hono/common'

import { ManifestSyncService } from './manifest-sync.service'

@Module({
  providers: [ManifestSyncService],
})
export class ManifestSyncModule {}
