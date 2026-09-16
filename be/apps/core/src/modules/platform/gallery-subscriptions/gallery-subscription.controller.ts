import type { HttpContextAuth } from '@core/context/http-context.values'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Controller, Delete, Get, HttpContext, Param, Put, Query } from '@tsuki-hono/common'

import { GallerySubscriptionTargetDto, GallerySubscriptionTimelineQueryDto } from './gallery-subscription.dto'
import { GallerySubscriptionService } from './gallery-subscription.service'

@Controller('gallery-subscriptions')
@SkipTenantGuard()
@AllowPlaceholderTenant()
@RequireAuth()
@BypassResponseTransform()
export class GallerySubscriptionController {
  constructor(private readonly subscriptions: GallerySubscriptionService) {}

  @Get('/')
  async list() {
    const userId = this.requireUserId()
    return { subscriptions: await this.subscriptions.listForUser(userId) }
  }

  @Get('/timeline')
  async timeline(@Query() query: GallerySubscriptionTimelineQueryDto) {
    return await this.subscriptions.listTimelineForUser(this.requireUserId(), query)
  }

  @Put('/:tenantId')
  async subscribe(@Param() { tenantId }: GallerySubscriptionTargetDto) {
    const subscription = await this.subscriptions.subscribe(this.requireUserId(), tenantId)
    return { ...subscription, subscribed: true }
  }

  @Delete('/:tenantId')
  async unsubscribe(@Param() { tenantId }: GallerySubscriptionTargetDto) {
    await this.subscriptions.unsubscribe(this.requireUserId(), tenantId)
    return { tenantId, subscribed: false }
  }

  private requireUserId(): string {
    const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
    if (!auth?.user || !auth.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return auth.user.id
  }
}
