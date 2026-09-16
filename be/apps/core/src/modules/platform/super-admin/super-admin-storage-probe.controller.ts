import { Buffer } from 'node:buffer'

import { BizException, ErrorCode } from '@core/errors'
import { PlatformRoles } from '@core/guards/roles.decorator'
import type { BuilderStorageProvider } from '@core/modules/configuration/setting/storage-provider.utils'
import { parseStorageProviders } from '@core/modules/configuration/setting/storage-provider.utils'
import { ContextParam, Controller, Post } from '@tsuki-hono/common'
import type { Context } from 'hono'

import { SuperAdminAuditService } from './super-admin-audit.service'
import { MAX_STORAGE_PROBE_FILE_SIZE, SuperAdminStorageProbeService } from './super-admin-storage-probe.service'

@Controller('super-admin/storage-providers')
@PlatformRoles('superadmin')
export class SuperAdminStorageProbeController {
  constructor(
    private readonly storageProbeService: SuperAdminStorageProbeService,
    private readonly audit: SuperAdminAuditService,
  ) {}

  @Post('test-upload')
  async testUpload(@ContextParam() context: Context) {
    const payload = await context.req.parseBody()
    const provider = this.parseProvider(payload.provider)
    const file = await this.extractFile(payload)
    return await this.audit.run(
      {
        action: 'storage-provider.test-upload',
        targetType: 'storage-provider',
        targetId: provider.id,
        before: {
          providerType: provider.type,
          fileName: file.name,
          contentType: file.contentType,
          size: file.size,
        },
      },
      async () => await this.storageProbeService.testUpload(provider, file),
      result => ({
        after: {
          checksum: result.checksum,
          cleanupSucceeded: result.cleanupSucceeded,
          readDurationMs: result.readDurationMs,
          uploadDurationMs: result.uploadDurationMs,
        },
      }),
    )
  }

  private parseProvider(raw: unknown): BuilderStorageProvider {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少存储 Provider 配置' })
    }

    try {
      const provider = parseStorageProviders(JSON.stringify([JSON.parse(raw)]))[0]
      if (!provider) {
        throw new Error('Invalid provider')
      }
      return provider
    }
    catch {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '存储 Provider 配置格式无效' })
    }
  }

  private async extractFile(payload: Record<string, unknown>) {
    const file = Object.values(payload).find((value): value is File => value instanceof File)
    if (!file) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '请选择一个测试文件' })
    }
    if (file.size > MAX_STORAGE_PROBE_FILE_SIZE) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '测试文件不能超过 25 MB' })
    }

    return {
      name: file.name || 'storage-probe.bin',
      size: file.size,
      contentType: file.type || null,
      buffer: Buffer.from(await file.arrayBuffer()),
    }
  }
}
