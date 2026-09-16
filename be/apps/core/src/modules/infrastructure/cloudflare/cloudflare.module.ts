import { Module } from '@tsuki-hono/common'

import { CloudflareCustomHostnameService } from './cloudflare-custom-hostname.service'

@Module({
  providers: [CloudflareCustomHostnameService],
})
export class CloudflareModule {}
