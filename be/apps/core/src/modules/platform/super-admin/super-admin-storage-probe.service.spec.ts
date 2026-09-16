import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import type { StorageProbeFile } from './super-admin-storage-probe.service'
import { runStorageUploadProbe } from './super-admin-storage-probe.service'

const file: StorageProbeFile = {
  name: 'probe.txt',
  size: 13,
  contentType: 'text/plain',
  buffer: Buffer.from('storage probe'),
}

describe('runStorageUploadProbe', () => {
  it('uploads, verifies, and removes the probe object', async () => {
    const manager = {
      uploadFile: vi.fn(async (key: string) => ({ key, size: file.size, etag: 'etag-1' })),
      getFile: vi.fn(async () => Buffer.from(file.buffer)),
      deleteFile: vi.fn(async () => undefined),
    }

    const result = await runStorageUploadProbe(manager, file, '.afilmory/test-uploads/probe.txt')

    expect(manager.uploadFile).toHaveBeenCalledOnce()
    expect(manager.getFile).toHaveBeenCalledWith('.afilmory/test-uploads/probe.txt')
    expect(manager.deleteFile).toHaveBeenCalledWith('.afilmory/test-uploads/probe.txt')
    expect(result).toMatchObject({
      cleanupSucceeded: true,
      etag: 'etag-1',
      size: file.size,
    })
  })

  it('still removes the probe object when read-back verification fails', async () => {
    const manager = {
      uploadFile: vi.fn(async (key: string) => ({ key, size: file.size })),
      getFile: vi.fn(async () => Buffer.from('corrupted')),
      deleteFile: vi.fn(async () => undefined),
    }

    await expect(runStorageUploadProbe(manager, file, 'probe.txt')).rejects.toThrow('checksum verification')
    expect(manager.deleteFile).toHaveBeenCalledWith('probe.txt')
  })

  it('reports a cleanup failure after successful verification', async () => {
    const manager = {
      uploadFile: vi.fn(async (key: string) => ({ key, size: file.size })),
      getFile: vi.fn(async () => Buffer.from(file.buffer)),
      deleteFile: vi.fn(async () => {
        throw new Error('delete denied')
      }),
    }

    const result = await runStorageUploadProbe(manager, file, 'probe.txt')

    expect(result.cleanupSucceeded).toBe(false)
    expect(result.cleanupError).toBe('delete denied')
    expect(result.objectKey).toBe('probe.txt')
  })
})
