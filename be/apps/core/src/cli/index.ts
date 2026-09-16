import process from 'node:process'

import type { ManifestMigrationCliOptions } from './manifest-migrate'
import { handleManifestMigrationCli, parseManifestMigrationCliArgs } from './manifest-migrate'
import type { MigrationCliOptions } from './migrate'
import { handleMigrationCli, parseMigrationCliArgs } from './migrate'
import type { ResetCliOptions } from './reset-superadmin'
import { handleResetSuperAdminPassword, parseResetCliArgs } from './reset-superadmin'
import type { SeedDevCliOptions } from './seed-dev'
import { handleSeedDevCli, parseSeedDevCliArgs } from './seed-dev'

type CliCommand<TOptions> = {
  name: string
  parse: (argv: readonly string[]) => TOptions | null
  execute: (options: TOptions) => Promise<void>
  onError?: (error: unknown) => void
}

const cliCommands: Array<CliCommand<unknown>> = [
  {
    name: 'db:migrate',
    parse: parseMigrationCliArgs,
    execute: options => handleMigrationCli(options as MigrationCliOptions),
    onError: (error) => {
      console.error('Database migration failed', error)
    },
  },
  {
    name: 'manifest:migrate',
    parse: parseManifestMigrationCliArgs,
    execute: options => handleManifestMigrationCli(options as ManifestMigrationCliOptions),
    onError: (error) => {
      console.error('Manifest migration failed', error)
    },
  },
  {
    name: 'seed-dev',
    parse: parseSeedDevCliArgs,
    execute: options => handleSeedDevCli(options as SeedDevCliOptions),
    onError: (error) => {
      console.error('Local dev seed failed', error)
    },
  },
  {
    name: 'reset-superadmin-password',
    parse: parseResetCliArgs,
    execute: options => handleResetSuperAdminPassword(options as ResetCliOptions),
    onError: (error) => {
      console.error('Superadmin password reset failed', error)
    },
  },
]

export async function runCliPipeline(argv: readonly string[]): Promise<boolean> {
  for (const command of cliCommands) {
    const parsedOptions = command.parse(argv)
    if (!parsedOptions) {
      continue
    }

    try {
      await command.execute(parsedOptions)
    }
    catch (error) {
      command.onError?.(error)

      process.exit(1)
      return true
    }

    return true
  }

  return false
}
