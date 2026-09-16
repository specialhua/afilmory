import { tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { SETTING_SCHEMAS } from '@core/modules/configuration/setting/setting.constant'
import type { SettingEntryInput } from '@core/modules/configuration/setting/setting.service'
import { SettingService } from '@core/modules/configuration/setting/setting.service'
import type { SettingKeyType } from '@core/modules/configuration/setting/setting.type'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { HttpContext } from '@tsuki-hono/common'
import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import { getTenantContext, isPlaceholderTenantContext } from '../tenant/tenant.context'
import { TenantRepository } from '../tenant/tenant.repository'
import { TenantService } from '../tenant/tenant.service'
import type { TenantRecord } from '../tenant/tenant.types'
import type { AuthSession } from './auth.provider'
import { AuthProvider } from './auth.provider'
import { resolveRegistrationStorageDefaults } from './auth-registration-storage.policy'
import { WorkspaceMembershipService } from './workspace-membership.service'

const DIACRITIC_PATTERN = /[\u0300-\u036F]/g
const NON_SLUG_CHARACTER_PATTERN = /[^a-z0-9]+/g
const REPEATED_HYPHEN_PATTERN = /-{2,}/g
const EDGE_HYPHEN_PATTERN = /^-+|-+$/g

type RegisterTenantAccountInput = {
  email: string
  password: string
  name: string
}

type RegisterTenantInput = {
  account?: RegisterTenantAccountInput
  tenant?: {
    name: string
    slug?: string | null
  }
  settings?: Array<{ key: string, value: unknown }>
  useSessionAccount?: boolean
}

export interface RegisterTenantResult {
  response: Response
  tenant?: TenantRecord
  accountId?: string
  success: boolean
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replaceAll(DIACRITIC_PATTERN, '')
    .toLowerCase()
    .replaceAll(NON_SLUG_CHARACTER_PATTERN, '-')
    .replaceAll(REPEATED_HYPHEN_PATTERN, '-')
    .replaceAll(EDGE_HYPHEN_PATTERN, '')
}

@injectable()
export class AuthRegistrationService {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly tenantService: TenantService,
    private readonly tenantRepository: TenantRepository,
    private readonly systemSettings: SystemSettingService,
    private readonly settingService: SettingService,
    private readonly dbAccessor: DbAccessor,
    private readonly memberships: WorkspaceMembershipService,
  ) {}

  async registerTenant(input: RegisterTenantInput, headers: Headers): Promise<RegisterTenantResult> {
    await this.systemSettings.ensureRegistrationAllowed()

    const tenantContext = getTenantContext()
    const isPendingTenant = tenantContext ? isPlaceholderTenantContext(tenantContext) : false
    const account = input.account ? this.normalizeAccountInput(input.account) : null
    const useSessionAccount = input.useSessionAccount ?? false
    const authSession = this.getAuthSession()

    if (useSessionAccount && !authSession) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: '请先登录后再创建工作区' })
    }

    if (isPendingTenant && tenantContext) {
      return await this.finalizePendingTenant({
        tenantContext,
        tenantInput: input.tenant,
        settings: input.settings,
        authSession,
        useSessionAccount,
      })
    }

    if (tenantContext) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: '不能通过工作区地址自行加入现有工作区，请使用成员邀请流程。',
      })
    }

    if (!input.tenant) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户信息不能为空' })
    }

    if (!account && !useSessionAccount) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少注册账号信息' })
    }

    return await this.registerNewTenant(account, input.tenant, headers, input.settings, authSession)
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const sanitizedBase = base.length > 0 ? base : 'tenant'

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? sanitizedBase : `${sanitizedBase}-${attempt + 1}`
      const existing = await this.tenantRepository.findBySlug(candidate)
      if (!existing) {
        return candidate
      }
    }

    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
      message: '无法生成唯一的租户标识，请尝试使用不同的名称',
    })
  }

  private normalizeAccountInput(account: RegisterTenantAccountInput): Required<RegisterTenantAccountInput> {
    const email = account.email?.trim().toLowerCase() ?? ''
    if (!email) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '邮箱不能为空' })
    }

    const password = account.password?.trim() ?? ''
    if (password.length < 8) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '密码长度至少需要 8 个字符',
      })
    }

    return {
      email,
      password,
      name: account.name?.trim() || email,
    }
  }

  private normalizeSettings(settings?: RegisterTenantInput['settings']): SettingEntryInput[] {
    if (!settings || settings.length === 0) {
      return []
    }

    const normalized: SettingEntryInput[] = []
    for (const entry of settings) {
      const key = entry.key?.trim() ?? ''
      if (!key) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: 'Setting key cannot be empty' })
      }
      if (!(key in SETTING_SCHEMAS)) {
        throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: `Unknown setting key: ${key}` })
      }

      const typedKey = key as SettingKeyType
      normalized.push({
        key: typedKey,
        value: SETTING_SCHEMAS[typedKey].parse(entry.value),
      } as SettingEntryInput)
    }
    return normalized
  }

  private async finalizePendingTenant(params: {
    tenantContext: { tenant: TenantRecord, requestedSlug?: string | null }
    tenantInput?: RegisterTenantInput['tenant']
    settings?: RegisterTenantInput['settings']
    authSession: AuthSession | null
    useSessionAccount: boolean
  }): Promise<RegisterTenantResult> {
    const { tenantContext, tenantInput, settings, authSession, useSessionAccount } = params
    if (!tenantInput) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户信息不能为空' })
    }
    if (!useSessionAccount || !authSession) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '请通过已登录账号完成工作区初始化。' })
    }

    const tenantName = tenantInput.name?.trim() ?? ''
    if (!tenantName) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户名称不能为空' })
    }

    const currentSlug = tenantContext.tenant.slug?.toLowerCase() ?? ''
    const requestedSlug
      = tenantInput.slug?.trim().toLowerCase() ?? tenantContext.requestedSlug?.toLowerCase() ?? currentSlug
    if (!requestedSlug || requestedSlug !== currentSlug) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: '当前子域与请求的空间标识不匹配，无法完成注册。',
      })
    }

    const storageDefaults = resolveRegistrationStorageDefaults(await this.systemSettings.getManagedStorageProvider())
    const db = this.dbAccessor.get()
    const now = new Date().toISOString()
    const [updatedTenant] = await db
      .update(tenants)
      .set({
        name: tenantName,
        status: 'active',
        storagePlanId: storageDefaults?.storagePlanId ?? null,
        updatedAt: now,
      })
      .where(and(eq(tenants.id, tenantContext.tenant.id), eq(tenants.status, 'pending')))
      .returning()

    if (!updatedTenant) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: '该空间已被其他用户绑定，请联系管理员。',
      })
    }

    await this.memberships.createOwnerMembership(authSession.user.id, updatedTenant.id)
    await this.applyInitialSettings(updatedTenant.id, settings, storageDefaults?.activeProvider ?? null)
    await this.memberships.setSessionActiveWorkspace({
      sessionId: authSession.session.id,
      userId: authSession.user.id,
      tenantId: updatedTenant.id,
    })

    return {
      response: this.jsonResponse({ tenant: updatedTenant, user: authSession.user }),
      tenant: updatedTenant,
      accountId: authSession.user.id,
      success: true,
    }
  }

  private async registerNewTenant(
    account: Required<RegisterTenantAccountInput> | null,
    tenantInput: RegisterTenantInput['tenant'],
    headers: Headers,
    settings: RegisterTenantInput['settings'] | undefined,
    authSession: AuthSession | null,
  ): Promise<RegisterTenantResult> {
    const tenantName = tenantInput?.name?.trim() ?? ''
    if (!tenantName) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户名称不能为空' })
    }

    const slugBase = tenantInput?.slug?.trim() ? slugify(tenantInput.slug) : slugify(tenantName)
    if (!slugBase) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '租户标识不能为空' })
    }

    const slug = await this.generateUniqueSlug(slugBase)
    const storageDefaults = resolveRegistrationStorageDefaults(await this.systemSettings.getManagedStorageProvider())
    let tenantId: string | null = null

    try {
      const tenantAggregate = await this.tenantService.createTenant({
        name: tenantName,
        slug,
        storagePlanId: storageDefaults?.storagePlanId ?? null,
      })
      tenantId = tenantAggregate.tenant.id

      let response: Response
      let userId: string

      if (account) {
        const auth = await this.authProvider.getAuthForTenant({ id: tenantId, slug })
        response = await auth.api.signUpEmail({
          body: account,
          headers,
          asResponse: true,
        })

        if (!response.ok) {
          await this.tenantService.deleteTenant(tenantId).catch(() => {})
          return { response, success: false }
        }

        const identity = await this.readSignUpIdentity(response)
        userId = identity.userId
        if (identity.token) {
          await this.memberships.setSessionActiveWorkspaceByToken({
            token: identity.token,
            userId,
            tenantId,
          })
        }
      }
      else if (authSession) {
        userId = authSession.user.id
        response = this.jsonResponse({ user: authSession.user })
      }
      else {
        throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, { message: '请先登录后再创建工作区' })
      }

      await this.memberships.createOwnerMembership(userId, tenantId)
      await this.applyInitialSettings(tenantId, settings, storageDefaults?.activeProvider ?? null)

      if (authSession) {
        await this.memberships.setSessionActiveWorkspace({
          sessionId: authSession.session.id,
          userId,
          tenantId,
        })
      }

      const refreshed = await this.tenantService.getById(tenantId)
      return {
        response,
        tenant: refreshed.tenant,
        accountId: userId,
        success: true,
      }
    }
    catch (error) {
      if (tenantId) {
        await this.tenantService.deleteTenant(tenantId).catch(() => {})
      }
      throw error
    }
  }

  private async applyInitialSettings(
    tenantId: string,
    settings: RegisterTenantInput['settings'] | undefined,
    defaultActiveProvider: 'managed' | null,
  ): Promise<void> {
    if (defaultActiveProvider) {
      await this.settingService.set('builder.storage.activeProvider', defaultActiveProvider, {
        tenantId,
        isSensitive: false,
      })
    }

    const initialSettings = this.normalizeSettings(settings)
    if (initialSettings.length === 0) {
      return
    }

    await this.settingService.setMany(
      initialSettings.map(entry => ({
        ...entry,
        options: {
          tenantId,
          isSensitive: false,
        },
      })),
    )
  }

  private getAuthSession(): AuthSession | null {
    try {
      const auth = HttpContext.getValue('auth') as AuthSession | undefined
      return auth?.user && auth.session ? auth : null
    }
    catch {
      return null
    }
  }

  private async readSignUpIdentity(response: Response): Promise<{ userId: string, token: string | null }> {
    try {
      const payload = (await response.clone().json()) as { token?: string | null, user?: { id?: string } } | null
      if (payload?.user?.id) {
        return { userId: payload.user.id, token: payload.token ?? null }
      }
    }
    catch {
      // The explicit error below is more useful than a JSON parsing error.
    }

    throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
      message: '注册成功但未返回用户信息，请稍后重试。',
    })
  }

  private jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }
}
