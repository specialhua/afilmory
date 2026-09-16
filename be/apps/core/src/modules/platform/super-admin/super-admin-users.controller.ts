import { BizException, ErrorCode } from '@core/errors'
import { PlatformRoles } from '@core/guards/roles.decorator'
import { BypassResponseTransform } from '@core/interceptors/response-transform.decorator'
import { Body, Controller, Delete, Get, Param, Patch, Query } from '@tsuki-hono/common'

import { AuditLogQueryDto, ListUsersQueryDto, UpdateUserBanDto, UserIdParamDto } from './super-admin.dto'
import { SuperAdminAuditService } from './super-admin-audit.service'
import { SuperAdminUsersService } from './super-admin-users.service'

@Controller('super-admin/users')
@PlatformRoles('superadmin')
@BypassResponseTransform()
export class SuperAdminUsersController {
  constructor(
    private readonly users: SuperAdminUsersService,
    private readonly audit: SuperAdminAuditService,
  ) {}

  @Get('/')
  async list(@Query() query: ListUsersQueryDto) {
    return await this.users.list(query)
  }

  @Get('/:userId')
  async detail(@Param() params: UserIdParamDto) {
    return await this.users.getDetail(params.userId)
  }

  @Patch('/:userId/ban')
  async updateBan(@Param() params: UserIdParamDto, @Body() body: UpdateUserBanDto) {
    if (body.banned && this.audit.getActorUserId() === params.userId) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '不能封禁当前超级管理员账户。' })
    }
    await this.audit.run(
      {
        action: body.banned ? 'user.ban' : 'user.unban',
        targetType: 'user',
        targetId: params.userId,
      },
      async () => await this.users.updateBan(params.userId, body),
      result => ({
        before: result.before,
        after: result.after,
      }),
    )
    return { updated: true }
  }

  @Delete('/:userId/sessions')
  async revokeSessions(@Param() params: UserIdParamDto) {
    return await this.audit.run(
      {
        action: 'user.sessions.revoke',
        targetType: 'user',
        targetId: params.userId,
      },
      async () => ({ revokedSessions: await this.users.revokeSessions(params.userId) }),
      result => ({ after: result }),
    )
  }
}

@Controller('super-admin/audit-logs')
@PlatformRoles('superadmin')
@BypassResponseTransform()
export class SuperAdminAuditController {
  constructor(private readonly audit: SuperAdminAuditService) {}

  @Get('/')
  async list(@Query() query: AuditLogQueryDto) {
    return await this.audit.list(query)
  }
}
