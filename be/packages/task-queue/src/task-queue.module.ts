import { Module } from '@tsuki-hono/common'

import { TaskQueueManager } from './task-queue.manager'

@Module({
  providers: [TaskQueueManager],
})
export class TaskQueueModule {}
