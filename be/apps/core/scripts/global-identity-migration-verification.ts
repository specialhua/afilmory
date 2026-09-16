import 'reflect-metadata'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { authSessions, authUsers, dbSchema, tenantMemberships, tenants } from '@afilmory/db'
import type { ExecutionContext } from '@tsuki-hono/common'
import { HttpContext } from '@tsuki-hono/common'
import { eq } from 'drizzle-orm'
import type { MigrationMeta } from 'drizzle-orm/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Context } from 'hono'
import { Client, Pool } from 'pg'

import type { DbAccessor } from '../src/database/database.provider'
import { BizException, ErrorCode } from '../src/errors'
import { PlatformRoles, RequireAuth, TenantRoles } from '../src/guards/roles.decorator'
import { RolesGuard } from '../src/guards/roles.guard'
import { WorkspaceMembershipService } from '../src/modules/platform/auth/workspace-membership.service'
import type { TenantRecord } from '../src/modules/platform/tenant/tenant.types'

const TARGET_MIGRATION_TAG = '0015_glorious_cassandra_nova'
const REMEDIATION_MIGRATION_TAG = '0016_remove_legacy_social_memberships'
const TEST_DATABASE_ENV = 'AFILMORY_MIGRATION_TEST_DATABASE_URL'
const LOCAL_DATABASE_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const TENANT_MEMBERSHIP_MIGRATION_PATTERN = /CREATE TABLE "tenant_membership"/
const TENANT_MEMBERSHIP_REMEDIATION_PATTERN = /DELETE FROM "tenant_membership"/
const SAFE_DATABASE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const migrationsFolder = fileURLToPath(new URL('../../../packages/db/migrations/', import.meta.url))

interface MigrationJournal {
  entries: Array<{ idx: number, tag: string }>
}

interface MigrationSet {
  legacy: MigrationMeta[]
  target: MigrationMeta
  remediation: MigrationMeta
}

interface VerificationReport {
  databaseVersion: string
  migrationRunner: string
  successfulMigrationAssertions: number
  authorizationAssertions: number
  failureScenarioAssertions: number
  failureScenarios: string[]
}

function loadMigrationSet(): MigrationSet {
  const journal = JSON.parse(
    readFileSync(new URL('../../../packages/db/migrations/meta/_journal.json', import.meta.url), 'utf8'),
  ) as MigrationJournal
  const migrations = readMigrationFiles({ migrationsFolder })
  const targetIndex = journal.entries.findIndex(({ tag }) => tag === TARGET_MIGRATION_TAG)
  const remediationIndex = journal.entries.findIndex(({ tag }) => tag === REMEDIATION_MIGRATION_TAG)

  assert.notEqual(targetIndex, -1, `Migration ${TARGET_MIGRATION_TAG} is missing from the Drizzle journal.`)
  assert.equal(
    remediationIndex,
    targetIndex + 1,
    `Migration ${REMEDIATION_MIGRATION_TAG} must immediately follow ${TARGET_MIGRATION_TAG}.`,
  )
  assert.equal(migrations.length, journal.entries.length, 'The migration journal and SQL files are inconsistent.')

  const target = migrations[targetIndex]
  const remediation = migrations[remediationIndex]
  assert(target, `Migration ${TARGET_MIGRATION_TAG} could not be loaded.`)
  assert(remediation, `Migration ${REMEDIATION_MIGRATION_TAG} could not be loaded.`)
  assert.match(target.sql.join('\n'), TENANT_MEMBERSHIP_MIGRATION_PATTERN)
  assert.match(remediation.sql.join('\n'), TENANT_MEMBERSHIP_REMEDIATION_PATTERN)

  return {
    legacy: migrations.slice(0, targetIndex),
    target,
    remediation,
  }
}

function resolveAdminDatabaseUrl(): URL {
  const rawUrl = process.env[TEST_DATABASE_ENV]
  if (!rawUrl) {
    throw new Error(`${TEST_DATABASE_ENV} is required.`)
  }

  const url = new URL(rawUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${TEST_DATABASE_ENV} must use the postgres or postgresql protocol.`)
  }
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing to run destructive migration verification against non-local host ${url.hostname}.`)
  }

  return url
}

function databaseUrlFor(adminUrl: URL, databaseName: string): string {
  const url = new URL(adminUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function quoteIdentifier(identifier: string): string {
  assert.match(identifier, SAFE_DATABASE_IDENTIFIER_PATTERN)
  return `"${identifier}"`
}

async function applyMigration(client: Client, migration: MigrationMeta): Promise<void> {
  await client.query('BEGIN')
  try {
    for (const statement of migration.sql) {
      const sql = statement.trim()
      if (sql) {
        await client.query(sql)
      }
    }
    await client.query('COMMIT')
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function recordAppliedMigration(client: Client, migration: MigrationMeta): Promise<void> {
  await client.query(`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`, [
    migration.hash,
    migration.folderMillis,
  ])
}

async function applyLegacyMigrations(client: Client, migrations: MigrationMeta[]): Promise<void> {
  for (const migration of migrations) {
    await applyMigration(client, migration)
  }

  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" serial PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)
  for (const migration of migrations) {
    await recordAppliedMigration(client, migration)
  }
}

async function applyPendingMigrations(client: Client): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder })
}

async function queryCount(client: Client, sql: string, values: unknown[] = []): Promise<number> {
  const result = await client.query<{ count: string }>(sql, values)
  return Number(result.rows[0]?.count ?? 0)
}

async function expectUniqueViolation(client: Client, sql: string, values: unknown[] = []): Promise<void> {
  await client.query('BEGIN')
  try {
    await assert.rejects(
      client.query(sql, values),
      error => error instanceof Error && 'code' in error && error.code === '23505',
    )
  }
  finally {
    await client.query('ROLLBACK')
  }
}

async function seedSuccessfulLegacyState(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO "tenant" ("id", "slug", "name", "status", "created_at", "updated_at")
    VALUES
      ('tenant-alpha', 'alpha', 'Alpha', 'active', '2024-01-01', '2024-01-01'),
      ('tenant-beta', 'beta', 'Beta', 'active', '2024-01-01', '2024-01-01'),
      ('tenant-gamma', 'gamma', 'Gamma', 'active', '2024-01-01', '2024-01-01'),
      ('tenant-delta', 'delta', 'Delta', 'inactive', '2024-01-01', '2024-01-01'),
      ('tenant-epsilon', 'epsilon', 'Epsilon', 'suspended', '2024-01-01', '2024-01-01')
  `)

  await client.query(`
    INSERT INTO "auth_user" (
      "id", "name", "email", "email_verified", "creem_customer_id", "had_trial", "role", "tenant_id",
      "created_at", "updated_at"
    )
    VALUES
      ('alice-alpha', 'Alice Alpha', ' ALICE@example.com ', false, 'cust-alice', true, 'admin', 'tenant-alpha', '2024-01-01', '2024-04-01'),
      ('alice-beta', 'Alice Beta', 'alice@example.com', true, NULL, false, 'user', 'tenant-beta', '2024-02-01', '2024-02-01'),
      ('oauth-email-alpha-a', 'Verified OAuth', 'oauth-bridge@example.com', true, NULL, false, 'user', 'tenant-alpha', '2024-06-01', '2024-06-01'),
      ('oauth-email-alpha-b', 'Verified OAuth Alt', ' OAUTH-BRIDGE@example.com ', true, NULL, false, 'user', 'tenant-alpha', '2024-07-01', '2024-07-01'),
      ('oauth-email-beta', 'Verified OAuth Cross Provider', 'OAuth-Bridge@example.com', true, NULL, false, 'user', 'tenant-beta', '2024-08-01', '2024-08-01'),
      ('bob-beta', 'Bob', 'bob@example.com', true, 'cust-bob', false, 'admin', 'tenant-beta', '2024-01-02', '2024-01-02'),
      ('brenda-beta', 'Brenda', 'brenda@example.com', true, NULL, false, 'admin', 'tenant-beta', '2024-02-02', '2024-02-02'),
      ('operator-gamma', 'Operator', 'ops@example.com', false, NULL, false, 'superadmin', 'tenant-gamma', '2024-03-01', '2024-03-01'),
      ('operator-delta', 'Operator Alt', 'operator-alt@example.com', true, NULL, true, 'user', 'tenant-delta', '2024-01-01', '2024-01-01'),
      ('operator-bridge-global', 'Operator Bridge', 'operator-bridge@example.com', false, NULL, false, 'user', NULL, '2024-04-01', '2024-04-01'),
      ('carol-gamma', 'Carol', 'carol@example.com', true, NULL, false, 'user', 'tenant-gamma', '2024-01-03', '2024-01-03'),
      ('eve-alpha', 'Eve', 'eve@example.com', true, NULL, false, 'user', 'tenant-alpha', '2024-01-04', '2024-01-04'),
      ('global-legacy', 'Global Legacy', 'global@example.com', true, NULL, false, 'user', NULL, '2024-01-05', '2024-01-05'),
      ('epsilon-user', 'Epsilon User', 'epsilon@example.com', true, NULL, false, 'user', 'tenant-epsilon', '2024-01-06', '2024-01-06')
  `)

  await client.query(`
    INSERT INTO "auth_user" (
      "id", "name", "email", "email_verified", "role", "tenant_id", "banned",
      "ban_reason", "ban_expires_at", "created_at", "updated_at"
    )
    VALUES (
      'epsilon-global-banned', 'Epsilon Legacy', 'epsilon-alias@example.com', false, 'user', NULL, true,
      'legacy-security-ban', NULL, '2024-02-01', '2024-05-01'
    )
  `)

  await client.query(`
    INSERT INTO "auth_account" (
      "id", "account_id", "provider_id", "user_id", "tenant_id", "access_token", "password", "created_at", "updated_at"
    )
    VALUES
      ('account-alice-alpha-github', 'github-alice', 'github', 'alice-alpha', 'tenant-alpha', 'newer-noncanonical-token', NULL, '2024-01-01', '2024-04-01'),
      ('account-alice-beta-github', 'github-alice', 'github', 'alice-beta', 'tenant-beta', 'canonical-token', NULL, '2024-02-01', '2024-02-01'),
      ('account-alice-alpha-credential', 'alice-alpha', 'credential', 'alice-alpha', 'tenant-alpha', NULL, 'password-alpha', '2024-01-01', '2024-04-01'),
      ('account-alice-beta-credential', 'alice-beta', 'credential', 'alice-beta', 'tenant-beta', NULL, 'password-beta', '2024-02-01', '2024-02-01'),
      ('account-oauth-email-alpha-a', 'github-oauth-bridge-a', 'github', 'oauth-email-alpha-a', 'tenant-alpha', 'oauth-alpha-a-token', NULL, '2024-06-01', '2024-06-01'),
      ('account-oauth-email-alpha-b', 'github-oauth-bridge-b', 'github', 'oauth-email-alpha-b', 'tenant-alpha', 'oauth-alpha-b-token', NULL, '2024-07-01', '2024-07-01'),
      ('account-oauth-email-beta', 'google-oauth-bridge', 'google', 'oauth-email-beta', 'tenant-beta', 'oauth-beta-token', NULL, '2024-08-01', '2024-08-01'),
      ('account-bob-credential', 'bob-beta', 'credential', 'bob-beta', 'tenant-beta', NULL, 'password-bob', '2024-01-02', '2024-01-02'),
      ('account-brenda-credential', 'brenda-beta', 'credential', 'brenda-beta', 'tenant-beta', NULL, 'password-brenda', '2024-02-02', '2024-02-02'),
      ('account-operator-gamma-google', 'google-operator', 'google', 'operator-gamma', 'tenant-gamma', 'operator-canonical-token', NULL, '2024-03-01', '2024-03-01'),
      ('account-operator-delta-google', 'google-operator', 'google', 'operator-delta', 'tenant-delta', 'operator-alt-token', NULL, '2024-01-01', '2024-04-01'),
      ('account-operator-delta-github', 'github-operator-bridge', 'github', 'operator-delta', 'tenant-delta', 'operator-bridge-newer-token', NULL, '2024-03-01', '2024-05-01'),
      ('account-operator-bridge-github', 'github-operator-bridge', 'github', 'operator-bridge-global', NULL, 'operator-bridge-token', NULL, '2024-04-01', '2024-04-01'),
      ('account-carol-credential', 'carol-gamma', 'credential', 'carol-gamma', 'tenant-gamma', NULL, 'password-carol', '2024-01-03', '2024-01-03'),
      ('account-eve-credential', 'eve-alpha', 'credential', 'eve-alpha', 'tenant-alpha', NULL, 'password-eve', '2024-01-04', '2024-01-04'),
      ('account-global-credential', 'global-legacy', 'credential', 'global-legacy', NULL, NULL, 'password-global', '2024-01-05', '2024-01-05'),
      ('account-epsilon-credential', 'epsilon-user', 'credential', 'epsilon-user', 'tenant-epsilon', NULL, 'password-epsilon', '2024-01-06', '2024-01-06'),
      ('account-epsilon-user-github', 'github-epsilon', 'github', 'epsilon-user', 'tenant-epsilon', 'epsilon-canonical-token', NULL, '2024-01-06', '2024-01-06'),
      ('account-epsilon-global-github', 'github-epsilon', 'github', 'epsilon-global-banned', NULL, 'epsilon-banned-token', NULL, '2024-02-01', '2024-05-01')
  `)

  await client.query(`
    INSERT INTO "auth_session" ("id", "token", "expires_at", "tenant_id", "user_id", "created_at", "updated_at")
    VALUES
      ('legacy-session-alice-alpha', 'legacy-token-alice-alpha', '2035-01-01', 'tenant-alpha', 'alice-alpha', '2024-01-01', '2024-01-01'),
      ('legacy-session-alice-beta', 'legacy-token-alice-beta', '2035-01-01', 'tenant-beta', 'alice-beta', '2024-01-01', '2024-01-01'),
      ('legacy-session-operator', 'legacy-token-operator', '2035-01-01', 'tenant-gamma', 'operator-gamma', '2024-01-01', '2024-01-01'),
      ('legacy-session-global', 'legacy-token-global', '2035-01-01', NULL, 'global-legacy', '2024-01-01', '2024-01-01')
  `)

  await client.query(`
    INSERT INTO "comment" ("id", "tenant_id", "photo_id", "user_id", "content", "status", "created_at", "updated_at")
    VALUES
      ('comment-beta', 'tenant-beta', 'photo-beta', 'alice-alpha', 'Cross-workspace comment', 'approved', '2024-02-01', '2024-02-01'),
      ('comment-alpha', 'tenant-alpha', 'photo-alpha', 'alice-beta', 'Reverse cross-workspace comment', 'approved', '2024-02-02', '2024-02-02')
  `)

  await client.query(`
    INSERT INTO "comment_reaction" ("id", "tenant_id", "comment_id", "user_id", "reaction", "created_at")
    VALUES
      ('reaction-alice-alpha', 'tenant-beta', 'comment-beta', 'alice-alpha', 'heart', '2024-02-01'),
      ('reaction-alice-beta', 'tenant-beta', 'comment-beta', 'alice-beta', 'heart', '2024-02-02'),
      ('reaction-bob', 'tenant-beta', 'comment-beta', 'bob-beta', 'like', '2024-02-03')
  `)

  await client.query(`
    INSERT INTO "creem_subscription" (
      "id", "product_id", "reference_id", "creem_customer_id", "creem_subscription_id", "status", "created_at", "updated_at"
    )
    VALUES
      ('subscription-alice', 'pro', 'alice-alpha', 'cust-alice', 'creem-sub-alice', 'active', '2024-02-01', '2024-02-01'),
      ('subscription-bob', 'pro', 'bob-beta', 'cust-bob', 'creem-sub-bob', 'active', '2024-02-01', '2024-02-01'),
      ('subscription-global', 'pro', 'global-legacy', NULL, 'creem-sub-global', 'active', '2024-02-01', '2024-02-01')
  `)
}

async function verifyLegacyState(client: Client): Promise<number> {
  let assertions = 0

  assert.equal(await queryCount(client, 'SELECT count(*) FROM "auth_user"'), 15)
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "auth_account" WHERE "provider_id" = 'github' AND "account_id" = 'github-alice'`,
    ),
    2,
  )
  assertions += 1
  assert.equal(
    await queryCount(client, `SELECT count(*) FROM "auth_user" WHERE lower(trim("email")) = 'alice@example.com'`),
    2,
  )
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "auth_user" WHERE lower(trim("email")) = 'oauth-bridge@example.com'`,
    ),
    3,
  )
  assertions += 1
  assert.equal(await queryCount(client, 'SELECT count(*) FROM "auth_session" WHERE "tenant_id" IS NOT NULL'), 3)
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "comment_reaction" WHERE "comment_id" = 'comment-beta' AND "reaction" = 'heart'`,
    ),
    2,
  )
  assertions += 1

  return assertions
}

async function seedReleasedMigrationState(client: Client): Promise<void> {
  // Model the production window after the originally released 0015 but before
  // the forward reconciliation. The checked-in 0015 is corrected for clean
  // replays, so the released false grants are reconstructed explicitly here.
  await client.query(`
    INSERT INTO "tenant_membership" (
      "id", "tenant_id", "user_id", "role", "status", "created_at", "updated_at"
    )
    VALUES
      ('m_' || md5('tenant-beta:alice-beta'), 'tenant-beta', 'alice-beta', 'member', 'active', '2024-02-01', '2024-02-01'),
      ('m_' || md5('tenant-alpha:oauth-email-alpha-a'), 'tenant-alpha', 'oauth-email-alpha-a', 'member', 'active', '2024-06-01', '2024-07-01'),
      ('m_' || md5('tenant-beta:oauth-email-alpha-a'), 'tenant-beta', 'oauth-email-alpha-a', 'member', 'active', '2024-08-01', '2024-08-01'),
      ('m_' || md5('tenant-gamma:carol-gamma'), 'tenant-gamma', 'carol-gamma', 'member', 'active', '2024-01-03', '2024-01-03'),
      ('m_' || md5('tenant-alpha:eve-alpha'), 'tenant-alpha', 'eve-alpha', 'member', 'active', '2024-01-04', '2024-01-04')
  `)

  // This pair is one of the false-owner grants proven by the isolated
  // production-backup audit and embedded in 0016's forward reconciliation.
  await client.query(`
    INSERT INTO "tenant" ("id", "slug", "name", "status", "created_at", "updated_at")
    VALUES (
      '7386607879218849792', 'audited-false-owner', 'Audited false owner', 'active',
      '2024-01-01', '2024-01-01'
    )
  `)
  await client.query(`
    INSERT INTO "auth_user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
    VALUES (
      '7389446087650198528', 'Audited social identity', 'audited-social@example.invalid', true,
      '2024-01-01', '2024-01-01'
    )
  `)
  await client.query(`
    INSERT INTO "tenant_membership" (
      "id", "tenant_id", "user_id", "role", "status", "created_at", "updated_at"
    )
    VALUES (
      'm_' || md5('7386607879218849792:7389446087650198528'),
      '7386607879218849792', '7389446087650198528', 'owner', 'active',
      '2024-01-01', '2024-01-01'
    )
  `)

  // Add one explicit post-migration member to prove 0016 preserves real grants.
  await client.query(`
    INSERT INTO "tenant_membership" (
      "id", "tenant_id", "user_id", "role", "status", "created_at", "updated_at"
    )
    VALUES (
      'membership-eve-gamma-explicit', 'tenant-gamma', 'eve-alpha', 'member', 'active',
      '2026-07-31', '2026-07-31'
    )
  `)

  await client.query(`
    INSERT INTO "auth_session" (
      "id", "token", "expires_at", "active_tenant_id", "user_id", "created_at", "updated_at"
    )
    VALUES
      (
        'session-alice-legacy-member', 'token-alice-legacy-member', '2035-01-01',
        'tenant-beta', 'alice-beta', '2026-07-31', '2026-07-31'
      ),
      (
        'session-oauth-social-only', 'token-oauth-social-only', '2035-01-01',
        'tenant-beta', 'oauth-email-alpha-a', '2026-07-31', '2026-07-31'
      ),
      (
        'session-eve-explicit-member', 'token-eve-explicit-member', '2035-01-01',
        'tenant-alpha', 'eve-alpha', '2026-07-31', '2026-07-31'
      ),
      (
        'session-operator-owner', 'token-operator-owner', '2035-01-01',
        'tenant-gamma', 'operator-gamma', '2026-07-31', '2026-07-31'
      ),
      (
        'session-audited-false-owner', 'token-audited-false-owner', '2035-01-01',
        '7386607879218849792', '7389446087650198528', '2026-07-31', '2026-07-31'
      )
  `)
}

async function verifySuccessfulMigration(client: Client, expectedMigrationCount: number): Promise<number> {
  let assertions = 0

  assert.equal(await queryCount(client, 'SELECT count(*) FROM "auth_user"'), 10)
  assertions += 1
  assert.equal(await queryCount(client, 'SELECT count(*) FROM "tenant_membership"'), 5)
  assertions += 1
  assert.equal(
    await queryCount(client, `SELECT count(*) FROM "tenant_membership" WHERE "role" = 'owner' AND "status" = 'active'`),
    3,
  )
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "tenant_membership" WHERE "role" = 'member' AND left("id", 2) = 'm_'`,
    ),
    0,
  )
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "tenant_membership" WHERE "role" = 'member' AND left("id", 2) <> 'm_'`,
    ),
    1,
  )
  assertions += 1
  assert.equal(await queryCount(client, 'SELECT count(*) FROM "auth_session"'), 5)
  assertions += 1
  assert.equal(
    await queryCount(client, 'SELECT count(*) FROM "drizzle"."__drizzle_migrations"'),
    expectedMigrationCount,
  )
  assertions += 1

  const alice = await client.query<{
    id: string
    email: string
    role: string
    had_trial: boolean
    creem_customer_id: string | null
  }>(`SELECT "id", "email", "role", "had_trial", "creem_customer_id" FROM "auth_user" WHERE "id" = 'alice-beta'`)
  assert.deepEqual(alice.rows[0], {
    id: 'alice-beta',
    email: 'alice@example.com',
    role: 'user',
    had_trial: true,
    creem_customer_id: 'cust-alice',
  })
  assertions += 1

  const operator = await client.query<{ id: string, role: string, had_trial: boolean }>(
    `SELECT "id", "role", "had_trial" FROM "auth_user" WHERE "id" = 'operator-gamma'`,
  )
  assert.deepEqual(operator.rows[0], { id: 'operator-gamma', role: 'superadmin', had_trial: true })
  assertions += 1

  const epsilon = await client.query<{
    id: string
    email: string
    banned: boolean
    ban_reason: string | null
    ban_expires_at: string | null
  }>(`
    SELECT "id", "email", "banned", "ban_reason", "ban_expires_at"
    FROM "auth_user"
    WHERE "id" = 'epsilon-user'
  `)
  assert.deepEqual(epsilon.rows[0], {
    id: 'epsilon-user',
    email: 'epsilon@example.com',
    banned: true,
    ban_reason: 'legacy-security-ban',
    ban_expires_at: null,
  })
  assertions += 1

  assert.equal(await queryCount(client, `SELECT count(*) FROM "auth_user" WHERE "email" <> lower(trim("email"))`), 0)
  assertions += 1

  const owners = await client.query<{ tenant_id: string, user_id: string }>(`
    SELECT "tenant_id", "user_id"
    FROM "tenant_membership"
    WHERE "role" = 'owner' AND "status" = 'active'
    ORDER BY "tenant_id"
  `)
  assert.deepEqual(owners.rows, [
    { tenant_id: 'tenant-alpha', user_id: 'alice-beta' },
    { tenant_id: 'tenant-beta', user_id: 'bob-beta' },
    { tenant_id: 'tenant-gamma', user_id: 'operator-gamma' },
  ])
  assertions += 1

  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "tenant_membership" WHERE "tenant_id" IN ('tenant-delta', 'tenant-epsilon')`,
    ),
    0,
  )
  assertions += 1

  const auditedWorkspace = await client.query<{ status: string }>(`
    SELECT "status"
    FROM "tenant"
    WHERE "id" = '7386607879218849792'
  `)
  assert.deepEqual(auditedWorkspace.rows, [{ status: 'pending' }])
  assertions += 1
  assert.equal(
    await queryCount(client, `SELECT count(*) FROM "tenant_membership" WHERE "tenant_id" = '7386607879218849792'`),
    0,
  )
  assertions += 1

  const aliceMemberships = await client.query<{ tenant_id: string, role: string }>(`
    SELECT "tenant_id", "role"
    FROM "tenant_membership"
    WHERE "user_id" = 'alice-beta'
    ORDER BY "tenant_id"
  `)
  assert.deepEqual(aliceMemberships.rows, [{ tenant_id: 'tenant-alpha', role: 'owner' }])
  assertions += 1

  const trustedEmailUser = await client.query<{ email: string, id: string }>(`
    SELECT "id", "email"
    FROM "auth_user"
    WHERE lower(trim("email")) = 'oauth-bridge@example.com'
  `)
  assert.deepEqual(trustedEmailUser.rows, [{ id: 'oauth-email-alpha-a', email: 'oauth-bridge@example.com' }])
  assertions += 1

  const trustedEmailMemberships = await client.query<{ tenant_id: string }>(`
    SELECT "tenant_id"
    FROM "tenant_membership"
    WHERE "user_id" = 'oauth-email-alpha-a'
    ORDER BY "tenant_id"
  `)
  assert.deepEqual(trustedEmailMemberships.rows, [])
  assertions += 1

  const reconciledSessions = await client.query<{ active_workspace: string | null, id: string }>(`
    SELECT "session"."id", "tenant"."slug" AS "active_workspace"
    FROM "auth_session" "session"
    LEFT JOIN "tenant" ON "tenant"."id" = "session"."active_tenant_id"
    ORDER BY "session"."id"
  `)
  assert.deepEqual(reconciledSessions.rows, [
    { id: 'session-alice-legacy-member', active_workspace: 'alpha' },
    { id: 'session-audited-false-owner', active_workspace: null },
    { id: 'session-eve-explicit-member', active_workspace: 'gamma' },
    { id: 'session-oauth-social-only', active_workspace: null },
    { id: 'session-operator-owner', active_workspace: 'gamma' },
  ])
  assertions += 1

  const trustedEmailAccounts = await client.query<{ account_id: string, provider_id: string, user_id: string }>(`
    SELECT "account_id", "provider_id", "user_id"
    FROM "auth_account"
    WHERE "user_id" = 'oauth-email-alpha-a'
    ORDER BY "provider_id", "account_id"
  `)
  assert.deepEqual(trustedEmailAccounts.rows, [
    { account_id: 'github-oauth-bridge-a', provider_id: 'github', user_id: 'oauth-email-alpha-a' },
    { account_id: 'github-oauth-bridge-b', provider_id: 'github', user_id: 'oauth-email-alpha-a' },
    { account_id: 'google-oauth-bridge', provider_id: 'google', user_id: 'oauth-email-alpha-a' },
  ])
  assertions += 1

  const aliceGithub = await client.query<{ id: string, user_id: string, access_token: string }>(`
    SELECT "id", "user_id", "access_token"
    FROM "auth_account"
    WHERE "provider_id" = 'github' AND "account_id" = 'github-alice'
  `)
  assert.deepEqual(aliceGithub.rows, [
    { id: 'account-alice-alpha-github', user_id: 'alice-beta', access_token: 'newer-noncanonical-token' },
  ])
  assertions += 1

  const operatorAccounts = await client.query<{ account_id: string, provider_id: string, user_id: string }>(`
    SELECT "account_id", "provider_id", "user_id"
    FROM "auth_account"
    WHERE "user_id" = 'operator-gamma' AND "provider_id" <> 'credential'
    ORDER BY "provider_id"
  `)
  assert.deepEqual(operatorAccounts.rows, [
    { account_id: 'github-operator-bridge', provider_id: 'github', user_id: 'operator-gamma' },
    { account_id: 'google-operator', provider_id: 'google', user_id: 'operator-gamma' },
  ])
  assertions += 1

  const aliceCredential = await client.query<{ account_id: string, user_id: string, password: string }>(`
    SELECT "account_id", "user_id", "password"
    FROM "auth_account"
    WHERE "provider_id" = 'credential' AND "user_id" = 'alice-beta'
  `)
  assert.deepEqual(aliceCredential.rows, [
    { account_id: 'alice-beta', user_id: 'alice-beta', password: 'password-beta' },
  ])
  assertions += 1

  assert.equal(await queryCount(client, `SELECT count(*) FROM "comment" WHERE "user_id" = 'alice-beta'`), 2)
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM "comment_reaction" WHERE "comment_id" = 'comment-beta' AND "user_id" = 'alice-beta' AND "reaction" = 'heart'`,
    ),
    1,
  )
  assertions += 1
  assert.equal(
    await queryCount(client, `SELECT count(*) FROM "comment_reaction" WHERE "comment_id" = 'comment-beta'`),
    2,
  )
  assertions += 1

  const subscriptions = await client.query<{ id: string, tenant_id: string | null, reference_id: string }>(`
    SELECT "id", "tenant_id", "reference_id"
    FROM "creem_subscription"
    ORDER BY "id"
  `)
  assert.deepEqual(subscriptions.rows, [
    { id: 'subscription-alice', tenant_id: 'tenant-alpha', reference_id: 'alice-beta' },
    { id: 'subscription-bob', tenant_id: 'tenant-beta', reference_id: 'bob-beta' },
    { id: 'subscription-global', tenant_id: null, reference_id: 'global-legacy' },
  ])
  assertions += 1

  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM information_schema.columns WHERE table_name = 'auth_user' AND column_name = 'tenant_id'`,
    ),
    0,
  )
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM information_schema.columns WHERE table_name = 'auth_account' AND column_name = 'tenant_id'`,
    ),
    0,
  )
  assertions += 1
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM information_schema.columns WHERE table_name = 'auth_session' AND column_name = 'active_tenant_id'`,
    ),
    1,
  )
  assertions += 1

  return assertions
}

async function verifyPostMigrationConstraints(client: Client): Promise<number> {
  let assertions = 0

  await expectUniqueViolation(
    client,
    `INSERT INTO "auth_user" ("id", "name", "email") VALUES ('duplicate-email', 'Duplicate', ' ALICE@example.com ')`,
  )
  assertions += 1
  await expectUniqueViolation(
    client,
    `INSERT INTO "auth_account" ("id", "provider_id", "account_id", "user_id") VALUES ('duplicate-provider', 'github', 'github-alice', 'bob-beta')`,
  )
  assertions += 1
  await expectUniqueViolation(
    client,
    `INSERT INTO "tenant_membership" ("id", "tenant_id", "user_id", "role", "status") VALUES ('duplicate-membership', 'tenant-alpha', 'alice-beta', 'member', 'active')`,
  )
  assertions += 1
  await expectUniqueViolation(
    client,
    `INSERT INTO "tenant_membership" ("id", "tenant_id", "user_id", "role", "status") VALUES ('duplicate-owner', 'tenant-alpha', 'eve-alpha', 'owner', 'active')`,
  )
  assertions += 1

  return assertions
}

type ProbeMethod = 'admin' | 'member' | 'owner' | 'platform' | 'social'

class AuthorizationProbe {
  social() {}

  member() {}

  admin() {}

  owner() {}

  platform() {}
}

function decorateProbe(method: ProbeMethod, decorator: MethodDecorator): object {
  const descriptor = Object.getOwnPropertyDescriptor(AuthorizationProbe.prototype, method)
  assert(descriptor?.value)
  decorator(AuthorizationProbe.prototype, method, descriptor)
  return descriptor.value as object
}

const authorizationHandlers: Record<ProbeMethod, object> = {
  social: decorateProbe('social', RequireAuth()),
  member: decorateProbe('member', TenantRoles('member')),
  admin: decorateProbe('admin', TenantRoles('admin')),
  owner: decorateProbe('owner', TenantRoles('owner')),
  platform: decorateProbe('platform', PlatformRoles('superadmin')),
}

async function verifyDatabaseBackedAuthorization(databaseUrl: string, client: Client): Promise<number> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 })
  try {
    const db = drizzle(pool, { schema: dbSchema })
    const dbAccessor = { get: () => db } as unknown as DbAccessor
    const memberships = new WorkspaceMembershipService(dbAccessor)
    const guard = new RolesGuard(memberships)
    const workspaceRows = await db.select().from(tenants)
    const workspaces = new Map(workspaceRows.map(workspace => [workspace.id, workspace]))
    const expiresAt = '2035-01-01T00:00:00.000Z'

    await db.insert(tenantMemberships).values([
      {
        id: 'membership-global-suspended-beta',
        tenantId: 'tenant-beta',
        userId: 'global-legacy',
        role: 'admin',
        status: 'suspended',
      },
      {
        id: 'membership-alice-beta-explicit',
        tenantId: 'tenant-beta',
        userId: 'alice-beta',
        role: 'member',
        status: 'active',
      },
    ])
    await db.insert(authSessions).values([
      {
        id: 'session-alice',
        token: 'token-alice',
        userId: 'alice-beta',
        activeTenantId: 'tenant-alpha',
        expiresAt,
      },
      {
        id: 'session-bob',
        token: 'token-bob',
        userId: 'bob-beta',
        activeTenantId: 'tenant-beta',
        expiresAt,
      },
      {
        id: 'session-brenda',
        token: 'token-brenda',
        userId: 'brenda-beta',
        activeTenantId: 'tenant-beta',
        expiresAt,
      },
      {
        id: 'session-operator',
        token: 'token-operator',
        userId: 'operator-gamma',
        activeTenantId: 'tenant-gamma',
        expiresAt,
      },
      {
        id: 'session-global',
        token: 'token-global',
        userId: 'global-legacy',
        activeTenantId: null,
        expiresAt,
      },
    ])

    const users = new Map((await db.select().from(authUsers)).map(user => [user.id, user]))
    const sessions = new Map((await db.select().from(authSessions)).map(session => [session.id, session]))

    const runGuard = async (input: {
      handler: ProbeMethod
      tenantId: string
      userId?: string
      sessionId?: string
    }): Promise<boolean> => {
      const tenant = workspaces.get(input.tenantId)
      assert(tenant, `Missing test workspace ${input.tenantId}.`)
      const user = input.userId ? users.get(input.userId) : undefined
      const session = input.sessionId ? sessions.get(input.sessionId) : undefined
      const honoContext = { req: { method: 'GET', path: `/verification/${input.handler}` } } as unknown as Context
      const executionContext = {
        getClass: () => AuthorizationProbe,
        getContext: () => ({ hono: honoContext }),
        getHandler: () => authorizationHandlers[input.handler],
      } as unknown as ExecutionContext

      return await HttpContext.run(honoContext, async () => {
        HttpContext.assign({
          tenant: { tenant: tenant as TenantRecord },
          auth: user && session ? { user, session } : undefined,
        })
        return await guard.canActivate(executionContext)
      })
    }

    const expectDenied = async (input: Parameters<typeof runGuard>[0], expectedCode: ErrorCode): Promise<void> => {
      await assert.rejects(runGuard(input), error => error instanceof BizException && error.code === expectedCode)
    }

    let assertions = 0
    assert.equal(
      await runGuard({
        handler: 'social',
        tenantId: 'tenant-gamma',
        userId: 'alice-beta',
        sessionId: 'session-alice',
      }),
      true,
    )
    assertions += 1
    await expectDenied({ handler: 'social', tenantId: 'tenant-beta' }, ErrorCode.AUTH_UNAUTHORIZED)
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'admin',
        tenantId: 'tenant-alpha',
        userId: 'alice-beta',
        sessionId: 'session-alice',
      }),
      true,
    )
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'owner',
        tenantId: 'tenant-alpha',
        userId: 'alice-beta',
        sessionId: 'session-alice',
      }),
      true,
    )
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'member',
        tenantId: 'tenant-beta',
        userId: 'alice-beta',
        sessionId: 'session-alice',
      }),
      true,
    )
    assertions += 1
    await expectDenied(
      { handler: 'admin', tenantId: 'tenant-beta', userId: 'alice-beta', sessionId: 'session-alice' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'admin',
        tenantId: 'tenant-beta',
        userId: 'brenda-beta',
        sessionId: 'session-brenda',
      }),
      true,
    )
    assertions += 1
    await expectDenied(
      { handler: 'owner', tenantId: 'tenant-beta', userId: 'brenda-beta', sessionId: 'session-brenda' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    await expectDenied(
      { handler: 'admin', tenantId: 'tenant-gamma', userId: 'alice-beta', sessionId: 'session-alice' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    await expectDenied(
      { handler: 'admin', tenantId: 'tenant-alpha', userId: 'operator-gamma', sessionId: 'session-operator' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'platform',
        tenantId: 'tenant-alpha',
        userId: 'operator-gamma',
        sessionId: 'session-operator',
      }),
      true,
    )
    assertions += 1
    await expectDenied(
      { handler: 'platform', tenantId: 'tenant-alpha', userId: 'alice-beta', sessionId: 'session-alice' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    await expectDenied(
      { handler: 'admin', tenantId: 'tenant-beta', userId: 'global-legacy', sessionId: 'session-global' },
      ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    assert.equal(
      await runGuard({
        handler: 'social',
        tenantId: 'tenant-beta',
        userId: 'global-legacy',
        sessionId: 'session-global',
      }),
      true,
    )
    assertions += 1

    assert.equal(await memberships.resolveInitialActiveTenantId('alice-beta', 'tenant-beta'), 'tenant-beta')
    assertions += 1
    assert.equal(await memberships.resolveInitialActiveTenantId('global-legacy', 'tenant-beta'), null)
    assertions += 1
    assert.deepEqual(await memberships.listActiveForUser('global-legacy'), [])
    assertions += 1

    const aliceMemberships = await memberships.listActiveForUser('alice-beta')
    assert.deepEqual(
      aliceMemberships.map(({ role, workspace }) => ({ role, workspaceId: workspace.id })),
      [
        { role: 'member', workspaceId: 'tenant-beta' },
        { role: 'owner', workspaceId: 'tenant-alpha' },
      ],
    )
    assertions += 1

    const switched = await memberships.switchActiveWorkspace({
      sessionId: 'session-alice',
      userId: 'alice-beta',
      tenantId: 'tenant-beta',
    })
    assert.equal(switched.workspace.id, 'tenant-beta')
    const [switchedSession] = await db.select().from(authSessions).where(eq(authSessions.id, 'session-alice')).limit(1)
    assert.equal(switchedSession?.activeTenantId, 'tenant-beta')
    assertions += 2
    assert(switchedSession)
    sessions.set(switchedSession.id, switchedSession)
    assert.equal(
      await runGuard({
        handler: 'admin',
        tenantId: 'tenant-alpha',
        userId: 'alice-beta',
        sessionId: 'session-alice',
      }),
      true,
    )
    assertions += 1

    await assert.rejects(
      memberships.switchActiveWorkspace({
        sessionId: 'session-alice',
        userId: 'alice-beta',
        tenantId: 'tenant-gamma',
      }),
      error => error instanceof BizException && error.code === ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    await assert.rejects(
      memberships.switchActiveWorkspace({
        sessionId: 'session-global',
        userId: 'global-legacy',
        tenantId: 'tenant-beta',
      }),
      error => error instanceof BizException && error.code === ErrorCode.AUTH_FORBIDDEN,
    )
    assertions += 1
    await assert.rejects(
      memberships.switchActiveWorkspace({
        sessionId: 'session-bob',
        userId: 'alice-beta',
        tenantId: 'tenant-alpha',
      }),
      error => error instanceof BizException && error.code === ErrorCode.AUTH_UNAUTHORIZED,
    )
    assertions += 1

    await db.insert(authSessions).values({
      id: 'session-delete-alpha',
      token: 'token-delete-alpha',
      userId: 'alice-beta',
      activeTenantId: 'tenant-alpha',
      expiresAt,
    })
    await client.query(`DELETE FROM "tenant" WHERE "id" = 'tenant-alpha'`)
    assert.equal(await queryCount(client, `SELECT count(*) FROM "auth_user" WHERE "id" = 'alice-beta'`), 1)
    assertions += 1
    assert.equal(
      await queryCount(client, `SELECT count(*) FROM "tenant_membership" WHERE "tenant_id" = 'tenant-alpha'`),
      0,
    )
    assertions += 1
    assert.equal(
      await queryCount(
        client,
        `SELECT count(*) FROM "auth_session" WHERE "id" = 'session-delete-alpha' AND "active_tenant_id" IS NULL`,
      ),
      1,
    )
    assertions += 1
    assert.equal(
      await queryCount(
        client,
        `SELECT count(*) FROM "creem_subscription" WHERE "id" = 'subscription-alice' AND "tenant_id" IS NULL`,
      ),
      1,
    )
    assertions += 1
    assert.equal(await queryCount(client, `SELECT count(*) FROM "comment" WHERE "id" = 'comment-alpha'`), 0)
    assertions += 1
    assert.equal(await queryCount(client, `SELECT count(*) FROM "comment" WHERE "id" = 'comment-beta'`), 1)
    assertions += 1

    return assertions
  }
  finally {
    await pool.end()
  }
}

async function seedFailureScenario(client: Client, scenario: string): Promise<void> {
  switch (scenario) {
    case 'normalized-email-collision': {
      await client.query(`
        INSERT INTO "tenant" ("id", "slug", "name", "status")
        VALUES ('failure-a', 'failure-a', 'Failure A', 'active'), ('failure-b', 'failure-b', 'Failure B', 'active');
        INSERT INTO "auth_user" ("id", "name", "email", "email_verified", "role", "tenant_id")
        VALUES
          ('failure-user-a', 'Failure A', ' collision@example.com ', true, 'admin', 'failure-a'),
          ('failure-user-b', 'Failure B', 'COLLISION@example.com', true, 'admin', 'failure-b');
        INSERT INTO "auth_account" ("id", "account_id", "provider_id", "user_id", "tenant_id")
        VALUES
          ('failure-account-a', 'failure-user-a', 'credential', 'failure-user-a', 'failure-a'),
          ('failure-account-b', 'failure-user-b', 'credential', 'failure-user-b', 'failure-b');
      `)
      return
    }
    case 'untrusted-oauth-email-collision': {
      await client.query(`
        INSERT INTO "tenant" ("id", "slug", "name", "status")
        VALUES ('failure-a', 'failure-a', 'Failure A', 'active'), ('failure-b', 'failure-b', 'Failure B', 'active');
        INSERT INTO "auth_user" ("id", "name", "email", "email_verified", "role", "tenant_id")
        VALUES
          ('failure-user-a', 'Failure A', ' untrusted@example.com ', true, 'admin', 'failure-a'),
          ('failure-user-b', 'Failure B', 'UNTRUSTED@example.com', true, 'admin', 'failure-b');
        INSERT INTO "auth_account" ("id", "account_id", "provider_id", "user_id", "tenant_id")
        VALUES
          ('failure-account-a', 'untrusted-a', 'custom-oauth', 'failure-user-a', 'failure-a'),
          ('failure-account-b', 'untrusted-b', 'custom-oauth', 'failure-user-b', 'failure-b');
      `)
      return
    }
    case 'creem-customer-collision': {
      await client.query(`
        INSERT INTO "tenant" ("id", "slug", "name", "status")
        VALUES ('failure-a', 'failure-a', 'Failure A', 'active'), ('failure-b', 'failure-b', 'Failure B', 'active');
        INSERT INTO "auth_user" ("id", "name", "email", "role", "tenant_id", "creem_customer_id")
        VALUES
          ('failure-user-a', 'Failure A', 'failure-a@example.com', 'admin', 'failure-a', 'customer-a'),
          ('failure-user-b', 'Failure B', 'failure-b@example.com', 'admin', 'failure-b', 'customer-b');
        INSERT INTO "auth_account" ("id", "account_id", "provider_id", "user_id", "tenant_id")
        VALUES
          ('failure-account-a', 'shared-oauth', 'github', 'failure-user-a', 'failure-a'),
          ('failure-account-b', 'shared-oauth', 'github', 'failure-user-b', 'failure-b');
      `)
      return
    }
    case 'credential-account-collision': {
      await client.query(`
        INSERT INTO "tenant" ("id", "slug", "name", "status")
        VALUES ('failure-a', 'failure-a', 'Failure A', 'active'), ('failure-b', 'failure-b', 'Failure B', 'active');
        INSERT INTO "auth_user" ("id", "name", "email", "role", "tenant_id")
        VALUES
          ('failure-user-a', 'Failure A', 'failure-a@example.com', 'admin', 'failure-a'),
          ('failure-user-b', 'Failure B', 'failure-b@example.com', 'admin', 'failure-b');
        INSERT INTO "auth_account" ("id", "account_id", "provider_id", "user_id", "tenant_id")
        VALUES
          ('failure-account-a', 'shared-credential', 'credential', 'failure-user-a', 'failure-a'),
          ('failure-account-b', 'shared-credential', 'credential', 'failure-user-b', 'failure-b');
      `)
      return
    }
    case 'active-workspace-without-owner': {
      await client.query(`
        INSERT INTO "tenant" ("id", "slug", "name", "status")
        VALUES ('failure-orphan', 'failure-orphan', 'Failure Orphan', 'active')
      `)
      return
    }
    default:
      throw new Error(`Unknown failure scenario: ${scenario}`)
  }
}

const expectedFailureMessages: Record<string, string> = {
  'normalized-email-collision':
    'Global identity migration aborted: duplicate normalized emails remain after trusted identity reconciliation.',
  'untrusted-oauth-email-collision':
    'Global identity migration aborted: duplicate normalized emails remain after trusted identity reconciliation.',
  'creem-customer-collision':
    'Global identity migration aborted: one canonical user has multiple Creem customer identities.',
  'credential-account-collision':
    'Global identity migration aborted: an auth account maps to multiple canonical users.',
  'active-workspace-without-owner': 'Global identity migration aborted: an active workspace has no owner.',
}

async function verifyAtomicMigrationFailure(
  client: Client,
  scenario: string,
  expectedLegacyMigrationCount: number,
): Promise<number> {
  const usersBefore = await queryCount(client, 'SELECT count(*) FROM "auth_user"')
  await assert.rejects(
    applyPendingMigrations(client),
    error => error instanceof Error && error.message.includes(expectedFailureMessages[scenario] ?? ''),
  )

  assert.equal(await queryCount(client, 'SELECT count(*) FROM "auth_user"'), usersBefore)
  assert.equal(
    await queryCount(
      client,
      `SELECT count(*) FROM information_schema.columns WHERE table_name = 'auth_user' AND column_name = 'tenant_id'`,
    ),
    1,
  )
  assert.equal(
    await queryCount(client, `SELECT count(*) FROM information_schema.tables WHERE table_name = 'tenant_membership'`),
    0,
  )
  const typeResult = await client.query<{ type_name: string | null }>(
    `SELECT to_regtype('public.platform_role')::text AS "type_name"`,
  )
  assert.equal(typeResult.rows[0]?.type_name, null)
  assert.equal(
    await queryCount(client, 'SELECT count(*) FROM "drizzle"."__drizzle_migrations"'),
    expectedLegacyMigrationCount,
  )

  return 6
}

async function main(): Promise<void> {
  const adminUrl = resolveAdminDatabaseUrl()
  const migrationSet = loadMigrationSet()
  const admin = new Client({ connectionString: adminUrl.toString() })
  const createdDatabases = new Set<string>()
  const report: VerificationReport = {
    databaseVersion: '',
    migrationRunner: 'drizzle-orm/node-postgres/migrator',
    successfulMigrationAssertions: 0,
    authorizationAssertions: 0,
    failureScenarioAssertions: 0,
    failureScenarios: [],
  }

  await admin.connect()
  try {
    const version = await admin.query<{ server_version: string }>('SHOW server_version')
    report.databaseVersion = version.rows[0]?.server_version ?? 'unknown'

    const withFreshDatabase = async (
      label: string,
      run: (client: Client, databaseUrl: string) => Promise<void>,
    ): Promise<void> => {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
      const databaseName = `afilmory_identity_${label}_${suffix}`
      const quotedName = quoteIdentifier(databaseName)
      await admin.query(`CREATE DATABASE ${quotedName} TEMPLATE template0`)
      createdDatabases.add(databaseName)

      const databaseUrl = databaseUrlFor(adminUrl, databaseName)
      const client = new Client({ connectionString: databaseUrl })
      await client.connect()
      try {
        await applyLegacyMigrations(client, migrationSet.legacy)
        await run(client, databaseUrl)
      }
      finally {
        await client.end()
        await admin.query(`DROP DATABASE ${quotedName} WITH (FORCE)`)
        createdDatabases.delete(databaseName)
      }
    }

    await withFreshDatabase('success', async (client, databaseUrl) => {
      await seedSuccessfulLegacyState(client)
      report.successfulMigrationAssertions += await verifyLegacyState(client)

      // Apply the released migration first, create sessions in the vulnerable
      // intermediate state, then let Drizzle apply the forward reconciliation.
      await applyMigration(client, migrationSet.target)
      await recordAppliedMigration(client, migrationSet.target)
      await seedReleasedMigrationState(client)
      await applyPendingMigrations(client)
      report.successfulMigrationAssertions += await verifySuccessfulMigration(client, migrationSet.legacy.length + 2)
      report.successfulMigrationAssertions += await verifyPostMigrationConstraints(client)
      report.authorizationAssertions += await verifyDatabaseBackedAuthorization(databaseUrl, client)
    })

    for (const scenario of Object.keys(expectedFailureMessages)) {
      await withFreshDatabase(`failure_${report.failureScenarios.length}`, async (client) => {
        await seedFailureScenario(client, scenario)
        report.failureScenarioAssertions += await verifyAtomicMigrationFailure(
          client,
          scenario,
          migrationSet.legacy.length,
        )
      })
      report.failureScenarios.push(scenario)
    }
  }
  finally {
    for (const databaseName of createdDatabases) {
      await admin.query(`DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`)
    }
    await admin.end()
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

await main()
