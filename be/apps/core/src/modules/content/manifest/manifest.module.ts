import { Module } from '@tsuki-hono/common'

import { ManifestSyncModule } from '../manifest-sync/manifest-sync.module'
import { PhotoModule } from '../photo/photo.module'
import { ManifestPublicController } from './manifest.public.controller'
import { ManifestService } from './manifest.service'

@Module({
  imports: [PhotoModule, ManifestSyncModule],
  controllers: [ManifestPublicController],
  providers: [ManifestService],
})
export class ManifestModule {}
