import { DatabaseModule } from '@core/database/database.module'
import { Module } from '@tsuki-hono/common'

import { registerManagedStorageProvider } from './managed-storage.provider'
import { ManagedStorageService } from './managed-storage.service'

// Register the managed storage provider at module load so StorageFactory is ready before use.
registerManagedStorageProvider()

@Module({
  imports: [DatabaseModule],
  providers: [ManagedStorageService],
})
export class ManagedStorageModule {}
