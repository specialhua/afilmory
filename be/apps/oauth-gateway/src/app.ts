import { decodeGatewayState } from '@afilmory/be-utils'
import { Hono } from 'hono'

import type { GatewayConfig } from './config'
import { buildForwardLocation, resolveTargetHost, sanitizeTenantSlug } from './resolver'

function resolveTenantSlug(decodedState: ReturnType<typeof decodeGatewayState>): {
  invalid: boolean
  tenantSlug: string | null
} {
  const rawTenantSlug = decodedState?.tenantSlug ?? null
  if (!rawTenantSlug) {
    return { invalid: false, tenantSlug: null }
  }

  const tenantSlug = sanitizeTenantSlug(rawTenantSlug)
  return tenantSlug ? { invalid: false, tenantSlug } : { invalid: true, tenantSlug: null }
}

export function createOAuthGatewayApp(config: GatewayConfig): Hono {
  const app = new Hono()

  app.get('/healthz', c =>
    c.json({
      status: 'ok',
      service: 'oauth-gateway',
      timestamp: new Date().toISOString(),
    }))

  const callbackRouter = new Hono()

  callbackRouter.get('/:provider', (c) => {
    const provider = c.req.param('provider')
    const requestUrl = new URL(c.req.url)
    const stateParam = requestUrl.searchParams.get('state')

    if (!provider) {
      console.warn('[oauth-gateway:callback] Missing provider param', {
        path: c.req.path,
        queryParams: Object.fromEntries(requestUrl.searchParams),
      })
      return c.json({ error: 'missing_provider', message: 'Provider param is required.' }, 400)
    }

    const decodedState = stateParam ? decodeGatewayState(stateParam, { secret: config.stateSecret }) : null

    if (stateParam && !decodedState) {
      console.error('[oauth-gateway:callback] Invalid or expired state', {
        provider,
        stateLength: stateParam.length,
      })
      return c.json({ error: 'invalid_state', message: 'OAuth state is invalid or expired.' }, 400)
    }

    if (decodedState?.innerState) {
      requestUrl.searchParams.set('state', decodedState.innerState)
    }

    const resolvedTenant = resolveTenantSlug(decodedState)
    if (resolvedTenant.invalid) {
      return c.json({ error: 'invalid_state', message: 'OAuth state contains an invalid tenant.' }, 400)
    }

    const targetHost = resolveTargetHost(config, { tenantSlug: resolvedTenant.tenantSlug })
    if (!targetHost) {
      console.error('[oauth-gateway:callback] Unable to resolve target host', {
        provider,
        tenantSlug: resolvedTenant.tenantSlug,
        baseDomain: config.baseDomain,
      })
      return c.json({ error: 'unresolvable_host', message: 'Unable to resolve target tenant host.' }, 400)
    }

    const location = buildForwardLocation({
      config,
      provider,
      host: targetHost,
      query: requestUrl.searchParams,
    })

    return c.redirect(location, 302)
  })

  callbackRouter.post('/:provider', async (c) => {
    const provider = c.req.param('provider')
    const requestUrl = new URL(c.req.url)
    const contentType = c.req.header('content-type') ?? ''

    if (!provider) {
      return c.json({ error: 'missing_provider', message: 'Provider param is required.' }, 400)
    }
    if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
      return c.json({ error: 'unsupported_media_type', message: 'OAuth form callbacks must be URL encoded.' }, 415)
    }

    let formData: FormData
    try {
      formData = await c.req.raw.clone().formData()
    }
    catch {
      return c.json({ error: 'invalid_form', message: 'OAuth callback form could not be parsed.' }, 400)
    }

    const stateValue = formData.get('state')
    if (typeof stateValue !== 'string' || !stateValue) {
      return c.json({ error: 'missing_state', message: 'OAuth callback state is required.' }, 400)
    }

    const decodedState = decodeGatewayState(stateValue, { secret: config.stateSecret })
    if (!decodedState) {
      console.error('[oauth-gateway:callback] Invalid or expired form state', {
        provider,
        stateLength: stateValue.length,
      })
      return c.json({ error: 'invalid_state', message: 'OAuth state is invalid or expired.' }, 400)
    }

    const resolvedTenant = resolveTenantSlug(decodedState)
    if (resolvedTenant.invalid) {
      return c.json({ error: 'invalid_state', message: 'OAuth state contains an invalid tenant.' }, 400)
    }

    const targetHost = resolveTargetHost(config, { tenantSlug: resolvedTenant.tenantSlug })
    if (!targetHost) {
      console.error('[oauth-gateway:callback] Unable to resolve form callback target host', {
        provider,
        tenantSlug: resolvedTenant.tenantSlug,
        baseDomain: config.baseDomain,
      })
      return c.json({ error: 'unresolvable_host', message: 'Unable to resolve target tenant host.' }, 400)
    }

    const location = buildForwardLocation({
      config,
      provider,
      host: targetHost,
      query: requestUrl.searchParams,
    })

    // Apple uses response_mode=form_post. A 307 redirect makes the user agent
    // repeat the POST with the original form body at the tenant Core endpoint,
    // where the wrapped state is verified and unwrapped.
    return c.redirect(location, 307)
  })

  app.route(config.callbackBasePath, callbackRouter)

  app.notFound(c =>
    c.json(
      {
        error: 'not_found',
        path: c.req.path,
      },
      404,
    ))

  app.onError((err, c) => {
    console.error('[oauth-gateway] Unhandled error', err)
    return c.json({ error: 'internal_error', message: 'OAuth gateway encountered an unexpected error.' }, 500)
  })

  return app
}
