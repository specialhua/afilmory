import type { HttpContextAuth } from '@core/context/http-context.values'
import { AllowPlaceholderTenant } from '@core/decorators/allow-placeholder.decorator'
import { SkipTenantGuard } from '@core/decorators/skip-tenant.decorator'
import { BizException, ErrorCode } from '@core/errors'
import { RequireAuth } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Body, Controller, Delete, HttpContext, Put } from '@tsuki-hono/common'

import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from './push-device.dto'
import { PushDeviceService } from './push-device.service'

@Controller('push-devices')
@SkipTenantGuard()
@AllowPlaceholderTenant()
@RequireAuth()
@BypassResponseTransform()
export class PushDeviceController {
  constructor(private readonly devices: PushDeviceService) {}

  @Put('/')
  async register(@Body() body: RegisterPushDeviceDto) {
    await this.devices.register(this.requireUserId(), body)
    return { registered: true }
  }

  @Delete('/')
  async unregister(@Body() body: UnregisterPushDeviceDto) {
    await this.devices.unregister(this.requireUserId(), body.token)
    return { registered: false }
  }

  private requireUserId(): string {
    const auth = HttpContext.getValue('auth') as HttpContextAuth | undefined
    if (!auth?.user || !auth.session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED)
    }
    return auth.user.id
  }
}
