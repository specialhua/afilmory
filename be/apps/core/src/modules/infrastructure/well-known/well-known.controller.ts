import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Controller, Get } from '@tsuki-hono/common'

import { appleAppSiteAssociationResponse } from './apple-app-site-association'

@Controller({ bypassGlobalPrefix: true })
@SkipTenantGuard()
@AllowPlaceholderTenant()
export class WellKnownController {
  @Get('/.well-known/apple-app-site-association')
  @Get('/apple-app-site-association')
  @BypassResponseTransform()
  getAppleAppSiteAssociation() {
    return appleAppSiteAssociationResponse()
  }
}
