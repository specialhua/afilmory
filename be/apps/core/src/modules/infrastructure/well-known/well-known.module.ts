import { Module } from '@tsuki-hono/common'

import { WellKnownController } from './well-known.controller'

@Module({
  controllers: [WellKnownController],
})
export class WellKnownModule {}
