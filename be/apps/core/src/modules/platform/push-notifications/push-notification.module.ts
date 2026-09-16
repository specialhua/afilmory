import { TaskQueueModule } from '@afilmory/task-queue'
import { DatabaseModule } from '@core/database/database.module'
import { RedisModule } from '@core/redis/redis.module'
import { Module } from '@tsuki-hono/common'

import { APNsProvider } from './apns.provider'
import { GalleryPushQueue } from './gallery-push.queue'
import { PushDeviceController } from './push-device.controller'
import { PushDeviceService } from './push-device.service'

@Module({
  imports: [DatabaseModule, RedisModule, TaskQueueModule],
  controllers: [PushDeviceController],
  providers: [APNsProvider, GalleryPushQueue, PushDeviceService],
})
export class PushNotificationModule {}
