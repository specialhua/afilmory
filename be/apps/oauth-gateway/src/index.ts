import { serve } from '@hono/node-server'

import { createOAuthGatewayApp } from './app'
import { gatewayConfig } from './config'

const app = createOAuthGatewayApp(gatewayConfig)

serve(
  {
    fetch: app.fetch,
    hostname: gatewayConfig.host,
    port: gatewayConfig.port,
  },
  (info) => {
    // eslint-disable-next-line no-console
    console.info(
      `[oauth-gateway] listening on http://${info.address}:${info.port} | forwarding to base domain ${gatewayConfig.baseDomain}`,
    )
  },
)
