import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { FeaturedGalleriesController } from './featured-galleries.controller'
import { FeaturedGalleriesService } from './featured-galleries.service'

@Module({
  imports: [DatabaseModule],
  controllers: [FeaturedGalleriesController],
  providers: [FeaturedGalleriesService],
})
export class FeaturedGalleriesModule {}
