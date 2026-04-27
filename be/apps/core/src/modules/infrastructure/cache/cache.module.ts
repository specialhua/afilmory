import { RedisModule } from '@core/redis/redis.module'
import { Module } from '@tsuki-hono/common'

import { CacheService } from './cache.service'

@Module({
  imports: [RedisModule],
  providers: [CacheService],
})
export class CacheModule {}
