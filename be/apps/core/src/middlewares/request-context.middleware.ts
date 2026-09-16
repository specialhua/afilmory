import { logger } from '@core/helpers/logger.helper'
import type { ActivitySurface } from '@core/modules/platform/activity/activity.service'
import { ActivityService } from '@core/modules/platform/activity/activity.service'
import type { AuthSession } from '@core/modules/platform/auth/auth.provider'
import { AuthProvider } from '@core/modules/platform/auth/auth.provider'
import { getTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { TenantContextResolver } from '@core/modules/platform/tenant/tenant-context-resolver.service'
import type { SupportedLanguage } from '@core/modules/ui/ui-schema/ui-schema.i18n'
import { detectLanguageFromHeader } from '@core/modules/ui/ui-schema/ui-schema.i18n'
import type { HttpMiddleware } from '@tsuki-hono/common'
import { HttpContext, Middleware } from '@tsuki-hono/common'
import type { Context, Next } from 'hono'
import { injectable } from 'tsyringe'

@Middleware({ priority: -1 })
@injectable()
export class RequestContextMiddleware implements HttpMiddleware {
  private readonly log = logger.extend('RequestContextMiddleware')

  constructor(
    private readonly tenantContextResolver: TenantContextResolver,
    private readonly authProvider: AuthProvider,
    private readonly activityService: ActivityService,
  ) {}

  async use(context: Context, next: Next): Promise<Response | void> {
    this.ensureLanguageContext(context)
    await this.ensureTenantContext(context)
    await this.ensureAuthContext(context)
    return await next()
  }

  private ensureLanguageContext(context: Context): void {
    const language = this.resolveRequestLanguage(context)
    HttpContext.assign({ language })
  }

  private resolveRequestLanguage(context: Context): SupportedLanguage {
    const preferred = context.req.header('x-lang')
    if (preferred && preferred.trim().length > 0) {
      return detectLanguageFromHeader(preferred)
    }

    const acceptLanguage = context.req.header('accept-language')
    return detectLanguageFromHeader(acceptLanguage)
  }

  private async ensureTenantContext(context: Context): Promise<void> {
    if (getTenantContext()) {
      return
    }

    try {
      const tenantContext = await this.tenantContextResolver.resolve(context, {
        throwOnMissing: false,
        skipInitializationCheck: true,
      })
      if (tenantContext) {
        HttpContext.setValue('tenant', tenantContext)
      }
    }
    catch (error) {
      this.log.error(`Failed to resolve tenant context for ${context.req.method} ${context.req.path}`, error)
    }
  }

  private async ensureAuthContext(context: Context): Promise<void> {
    const authSession = await this.resolveAuthSession(context)
    if (!authSession) {
      return
    }

    HttpContext.assign({
      auth: {
        user: authSession.user,
        session: authSession.session,
      },
    })

    try {
      const session = authSession.session as typeof authSession.session & { activeTenantId?: string | null }
      await this.activityService.touch({
        userId: authSession.user.id,
        tenantId: session.activeTenantId ?? getTenantContext()?.tenant.id ?? null,
        sessionId: session.id,
        surface: this.resolveActivitySurface(context),
        appVersion: context.req.header('x-afilmory-app-version') ?? null,
      })
    }
    catch (error) {
      this.log.error('Failed to record authenticated activity', error)
    }
  }

  private resolveActivitySurface(context: Context): ActivitySurface {
    const explicit = context.req.header('x-afilmory-surface')
    if (explicit === 'mobile' || explicit === 'dashboard' || explicit === 'web') {
      return explicit
    }
    return context.req.path.startsWith('/api/super-admin') || context.req.path.startsWith('/super-admin')
      ? 'dashboard'
      : 'web'
  }

  private async resolveAuthSession(context: Context): Promise<AuthSession | null> {
    try {
      const { headers } = context.req.raw
      const globalAuth = await this.authProvider.getAuth()
      const authSession = await globalAuth.api.getSession({ headers })

      if (authSession) {
        this.log.verbose(
          `Session detected for user ${(authSession.user as { id?: string }).id ?? 'unknown'} on ${context.req.method} ${context.req.path}`,
        )
      }
      else {
        this.log.verbose(`No active session for ${context.req.method} ${context.req.path}`)
      }

      return authSession
    }
    catch (error) {
      this.log.error('Failed to resolve auth session from middleware', error)
      return null
    }
  }
}
