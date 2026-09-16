import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

import { StorageManager } from '@afilmory/builder/storage/index.js'
import type { StorageConfig, StorageObject } from '@afilmory/builder/storage/interfaces.js'
import { BizException, ErrorCode } from '@core/errors'
import type { BuilderStorageProvider } from '@core/modules/configuration/setting/storage-provider.utils'
import { mergeStorageProviderSecrets } from '@core/modules/configuration/setting/storage-provider.utils'
import { SystemSettingService } from '@core/modules/configuration/system-setting/system-setting.service'
import { PhotoStorageService } from '@core/modules/content/photo/storage/photo-storage.service'
import { joinSegments, normalizeKeyPath } from '@core/modules/content/photo/storage/storage.utils'
import { injectable } from 'tsyringe'

export const MAX_STORAGE_PROBE_FILE_SIZE = 25 * 1024 * 1024
const PROBE_STORAGE_PREFIX = '.afilmory/test-uploads'

export interface StorageProbeFile {
  name: string
  size: number
  contentType: string | null
  buffer: Buffer
}

export interface StorageProbeResult {
  providerId: string
  providerType: string
  fileName: string
  objectKey: string
  size: number
  checksum: string
  etag: string | null
  uploadDurationMs: number
  readDurationMs: number
  cleanupDurationMs: number
  cleanupSucceeded: boolean
  cleanupError: string | null
}

type StorageProbeManager = Pick<StorageManager, 'uploadFile' | 'getFile' | 'deleteFile'>

type StorageProbeExecutionResult = Omit<StorageProbeResult, 'providerId' | 'providerType' | 'fileName'>

export async function runStorageUploadProbe(
  manager: StorageProbeManager,
  file: StorageProbeFile,
  objectKey: string,
): Promise<StorageProbeExecutionResult> {
  const checksum = createHash('sha256').update(file.buffer).digest('hex')
  let uploadedObject: StorageObject | null = null
  let resolvedKey = objectKey
  let uploadDurationMs = 0
  let readDurationMs = 0
  let cleanupDurationMs = 0
  let cleanupError: string | null = null
  let operationError: unknown = null

  try {
    const uploadStartedAt = Date.now()
    uploadedObject = await manager.uploadFile(objectKey, file.buffer, {
      contentType: file.contentType ?? undefined,
    })
    uploadDurationMs = Date.now() - uploadStartedAt
    resolvedKey = normalizeKeyPath(uploadedObject.key || objectKey) || objectKey

    const readStartedAt = Date.now()
    const downloaded = await manager.getFile(resolvedKey)
    readDurationMs = Date.now() - readStartedAt
    if (!downloaded) {
      throw new Error('Uploaded object could not be read back from storage.')
    }

    const downloadedChecksum = createHash('sha256').update(downloaded).digest('hex')
    if (downloaded.length !== file.buffer.length || downloadedChecksum !== checksum) {
      throw new Error('Uploaded object failed the read-back checksum verification.')
    }
  }
  catch (error) {
    operationError = error
  }
  finally {
    if (uploadedObject) {
      const cleanupStartedAt = Date.now()
      try {
        await manager.deleteFile(resolvedKey)
      }
      catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error)
      }
      cleanupDurationMs = Date.now() - cleanupStartedAt
    }
  }

  if (operationError) {
    const message = operationError instanceof Error ? operationError.message : String(operationError)
    const cleanupSuffix = cleanupError ? ` Cleanup also failed for ${resolvedKey}: ${cleanupError}` : ''
    throw new Error(`${message}${cleanupSuffix}`)
  }

  return {
    objectKey: resolvedKey,
    size: file.buffer.length,
    checksum,
    etag: uploadedObject?.etag ?? null,
    uploadDurationMs,
    readDurationMs,
    cleanupDurationMs,
    cleanupSucceeded: cleanupError === null,
    cleanupError,
  }
}

@injectable()
export class SuperAdminStorageProbeService {
  constructor(
    private readonly systemSettingService: SystemSettingService,
    private readonly photoStorageService: PhotoStorageService,
  ) {}

  async testUpload(provider: BuilderStorageProvider, file: StorageProbeFile): Promise<StorageProbeResult> {
    this.assertFile(file)

    const settings = await this.systemSettingService.getSettings()
    const [resolvedProvider] = mergeStorageProviderSecrets([provider], settings.managedStorageProviders ?? [])
    if (!resolvedProvider) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '缺少有效的存储 Provider 配置' })
    }

    try {
      const storageConfig = this.photoStorageService.mapProviderToStorageConfig(resolvedProvider)
      const manager = new StorageManager(storageConfig)
      const result = await runStorageUploadProbe(manager, file, this.createProbeKey(file.name, storageConfig))

      return {
        providerId: resolvedProvider.id,
        providerType: resolvedProvider.type,
        fileName: file.name,
        ...result,
      }
    }
    catch (error) {
      if (error instanceof BizException) {
        throw error
      }
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, {
        message: error instanceof Error ? error.message : '存储测试上传失败',
      })
    }
  }

  private assertFile(file: StorageProbeFile): void {
    if (file.size <= 0 || file.buffer.length === 0) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '测试文件不能为空' })
    }
    if (file.size > MAX_STORAGE_PROBE_FILE_SIZE) {
      throw new BizException(ErrorCode.COMMON_BAD_REQUEST, { message: '测试文件不能超过 25 MB' })
    }
  }

  private createProbeKey(filename: string, storageConfig: StorageConfig): string {
    const extension = path.extname(filename).slice(0, 16) || '.bin'
    const probeKey = joinSegments(PROBE_STORAGE_PREFIX, `${Date.now()}-${randomUUID()}${extension}`)
    const prefix = 'prefix' in storageConfig && typeof storageConfig.prefix === 'string' ? storageConfig.prefix : null

    if (
      (storageConfig.provider === 's3' || storageConfig.provider === 'oss' || storageConfig.provider === 'cos')
      && prefix
    ) {
      return joinSegments(prefix, probeKey)
    }

    return probeKey
  }
}
