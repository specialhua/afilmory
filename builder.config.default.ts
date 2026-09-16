import os from 'node:os'

import { defineBuilderConfig, githubRepoSyncPlugin } from '@afilmory/builder'

import { env } from './env.js'

export default defineBuilderConfig(() => ({
  storage: {
    // "provider": "local",
    // "basePath": "./apps/web/public/photos",
    // "baseUrl": "/photos"

    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    customDomain: env.S3_CUSTOM_DOMAIN,
    excludeRegex: env.S3_EXCLUDE_REGEX,
    maxFileLimit: 1000,
    keepAlive: true,
    maxSockets: 64,
    connectionTimeoutMs: 5_000,
    socketTimeoutMs: 30_000,
    requestTimeoutMs: 20_000,
    idleTimeoutMs: 10_000,
    totalTimeoutMs: 60_000,
    retryMode: 'standard',
    maxAttempts: 3,
    downloadConcurrency: 16,
  },
  system: {
    processing: {
      defaultConcurrency: 10,
      enableLivePhotoDetection: true,
      digestSuffixLength: 8,
      xmp: {
        keywords: true,
        regions: true,
      },
    },
    observability: {
      showProgress: true,
      showDetailedStats: true,
      logging: {
        verbose: false,
        level: 'info',
        outputToFile: false,
      },
      performance: {
        worker: {
          workerCount: os.cpus().length * 2,
          timeout: 30_000,
          useClusterMode: true,
          workerConcurrency: 2,
        },
      },
    },
  },
  // plugins: [thumbnailStoragePlugin()],
  plugins: [
    githubRepoSyncPlugin({
      repo: {
        enable: false,
        url: process.env.BUILDER_REPO_URL ?? '',
        token: env.GIT_TOKEN,
        branch: process.env.BUILDER_REPO_BRANCH ?? 'main',
      },
    }),
  ],
}))
