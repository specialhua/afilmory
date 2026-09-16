import {
  apnsDevices,
  authAccounts,
  authSessions,
  authUsers,
  commentReactions,
  comments,
  creemSubscriptions,
  gallerySubscriptions,
  platformActivityEvents,
  tenantMemberships,
  tenants,
} from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, ilike, isNotNull, isNull, max, or, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { ListUsersQueryDto } from './super-admin.dto'

type CommercialStatus = 'none' | 'free-owner' | 'paid-owner' | 'paid-member' | 'mixed'

export function resolveCommercialStatus(input: {
  ownedFreeCount: number
  ownedPaidCount: number
  paidMemberCount: number
}): CommercialStatus {
  const categoryCount = [input.ownedFreeCount, input.ownedPaidCount, input.paidMemberCount].filter(
    count => count > 0,
  ).length
  if (categoryCount > 1)
    return 'mixed'
  if (input.ownedPaidCount > 0)
    return 'paid-owner'
  if (input.ownedFreeCount > 0)
    return 'free-owner'
  if (input.paidMemberCount > 0)
    return 'paid-member'
  return 'none'
}

export function resolveMobileSummary(input: {
  activityCount: number
  activityLastSeenAt: string | null
  activityAppVersion: string | null
  deviceCount: number
  deviceLastSeenAt: string | null
  deviceAppVersion: string | null
}) {
  const lastSeenAt
    = [input.activityLastSeenAt, input.deviceLastSeenAt]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  return {
    activityCount: input.activityCount,
    deviceCount: input.deviceCount,
    lastSeenAt,
    latestAppVersion: input.activityAppVersion ?? input.deviceAppVersion,
  }
}

@injectable()
export class SuperAdminUsersService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async list(query: ListUsersQueryDto) {
    const db = this.dbAccessor.get()
    const conditions: SQL[] = []

    if (query.search) {
      const pattern = `%${query.search}%`
      conditions.push(
        or(
          ilike(authUsers.name, pattern),
          ilike(authUsers.email, pattern),
          ilike(authUsers.username, pattern),
          eq(authUsers.id, query.search),
        )!,
      )
    }
    if (query.status === 'active')
      conditions.push(and(eq(authUsers.banned, false), isNull(authUsers.deletionRequestedAt))!)
    if (query.status === 'banned')
      conditions.push(eq(authUsers.banned, true))
    if (query.status === 'deleting')
      conditions.push(isNotNull(authUsers.deletionRequestedAt))
    if (query.emailVerified !== undefined)
      conditions.push(eq(authUsers.emailVerified, query.emailVerified))
    if (query.hasMobileDevice !== undefined) {
      const mobileExists = sql`(
        exists(select 1 from ${apnsDevices} d where d.user_id = ${authUsers.id})
        or exists(
          select 1 from ${platformActivityEvents} a
          where a.user_id = ${authUsers.id} and a.surface = 'mobile'
        )
      )`
      conditions.push(query.hasMobileDevice ? mobileExists : sql`not (${mobileExists})`)
    }

    const paidOwnerExists = sql`exists(
      select 1 from ${tenantMemberships} m
      join ${tenants} t on t.id = m.tenant_id
      where m.user_id = ${authUsers.id} and m.status = 'active' and m.role = 'owner' and t.plan_id <> 'free'
    )`
    const freeOwnerExists = sql`exists(
      select 1 from ${tenantMemberships} m
      join ${tenants} t on t.id = m.tenant_id
      where m.user_id = ${authUsers.id} and m.status = 'active' and m.role = 'owner' and t.plan_id = 'free'
    )`
    const paidMemberExists = sql`exists(
      select 1 from ${tenantMemberships} m
      join ${tenants} t on t.id = m.tenant_id
      where m.user_id = ${authUsers.id} and m.status = 'active' and m.role <> 'owner' and t.plan_id <> 'free'
    )`

    if (query.commercialStatus === 'none')
      conditions.push(sql`not (${paidOwnerExists}) and not (${freeOwnerExists}) and not (${paidMemberExists})`)
    if (query.commercialStatus === 'free-owner')
      conditions.push(sql`${freeOwnerExists} and not (${paidOwnerExists}) and not (${paidMemberExists})`)
    if (query.commercialStatus === 'paid-owner')
      conditions.push(sql`${paidOwnerExists} and not (${freeOwnerExists}) and not (${paidMemberExists})`)
    if (query.commercialStatus === 'paid-member')
      conditions.push(sql`${paidMemberExists} and not (${paidOwnerExists}) and not (${freeOwnerExists})`)
    if (query.commercialStatus === 'mixed') {
      conditions.push(sql`(
        ${paidOwnerExists} and (${freeOwnerExists} or ${paidMemberExists})
      ) or (${freeOwnerExists} and ${paidMemberExists})`)
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const sortColumn = {
      createdAt: authUsers.createdAt,
      lastSignedInAt: authUsers.lastSignedInAt,
      lastActiveAt: authUsers.lastActiveAt,
      name: authUsers.name,
    }[query.sortBy]
    const orderDirection = query.sortDir === 'asc' ? sql`asc` : sql`desc`
    const orderBy = sql`${sortColumn} ${orderDirection} nulls last`

    const [rows, totalRows, stats] = await Promise.all([
      db
        .select({
          id: authUsers.id,
          name: authUsers.name,
          email: authUsers.email,
          image: authUsers.image,
          emailVerified: authUsers.emailVerified,
          role: authUsers.role,
          banned: authUsers.banned,
          banReason: authUsers.banReason,
          banExpires: authUsers.banExpires,
          twoFactorEnabled: authUsers.twoFactorEnabled,
          hadTrial: authUsers.hadTrial,
          deletionRequestedAt: authUsers.deletionRequestedAt,
          createdAt: authUsers.createdAt,
          updatedAt: authUsers.updatedAt,
          lastSignedInAt: authUsers.lastSignedInAt,
          lastActiveAt: authUsers.lastActiveAt,
          lastActiveSurface: authUsers.lastActiveSurface,
          membershipCount: sql<number>`(select count(*)::int from ${tenantMemberships} m where m.user_id = ${authUsers.id} and m.status = 'active')`,
          ownedFreeCount: sql<number>`(select count(*)::int from ${tenantMemberships} m join ${tenants} t on t.id = m.tenant_id where m.user_id = ${authUsers.id} and m.status = 'active' and m.role = 'owner' and t.plan_id = 'free')`,
          ownedPaidCount: sql<number>`(select count(*)::int from ${tenantMemberships} m join ${tenants} t on t.id = m.tenant_id where m.user_id = ${authUsers.id} and m.status = 'active' and m.role = 'owner' and t.plan_id <> 'free')`,
          paidMemberCount: sql<number>`(select count(*)::int from ${tenantMemberships} m join ${tenants} t on t.id = m.tenant_id where m.user_id = ${authUsers.id} and m.status = 'active' and m.role <> 'owner' and t.plan_id <> 'free')`,
          mobileDeviceCount: sql<number>`(select count(*)::int from ${apnsDevices} d where d.user_id = ${authUsers.id})`,
          mobileLastSeenAt: sql<string | null>`(
            select max(seen_at) from (
              select max(d.last_seen_at) as seen_at from ${apnsDevices} d where d.user_id = ${authUsers.id}
              union all
              select max(a.occurred_at) as seen_at from ${platformActivityEvents} a
              where a.user_id = ${authUsers.id} and a.surface = 'mobile'
            ) mobile_presence
          )`,
          latestAppVersion: sql<string | null>`coalesce(
            (
              select a.app_version from ${platformActivityEvents} a
              where a.user_id = ${authUsers.id} and a.surface = 'mobile' and a.app_version is not null
              order by a.occurred_at desc limit 1
            ),
            (
              select d.app_version from ${apnsDevices} d
              where d.user_id = ${authUsers.id} and d.app_version is not null
              order by d.last_seen_at desc limit 1
            )
          )`,
        })
        .from(authUsers)
        .where(where)
        .orderBy(orderBy)
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      db.select({ total: count() }).from(authUsers).where(where),
      this.getStats(),
    ])

    return {
      users: rows.map(row => ({
        ...row,
        membershipCount: Number(row.membershipCount ?? 0),
        mobileDeviceCount: Number(row.mobileDeviceCount ?? 0),
        commercialStatus: resolveCommercialStatus({
          ownedFreeCount: Number(row.ownedFreeCount ?? 0),
          ownedPaidCount: Number(row.ownedPaidCount ?? 0),
          paidMemberCount: Number(row.paidMemberCount ?? 0),
        }),
      })),
      total: Number(totalRows[0]?.total ?? 0),
      stats,
    }
  }

  async getDetail(userId: string) {
    const db = this.dbAccessor.get()
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1)
    if (!user)
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '用户不存在' })

    const [memberships, accounts, sessions, activities, devices, subscriptions, socialCounts, mobilePresence]
      = await Promise.all([
        db
          .select({
            id: tenantMemberships.id,
            tenantId: tenants.id,
            tenantName: tenants.name,
            tenantSlug: tenants.slug,
            role: tenantMemberships.role,
            status: tenantMemberships.status,
            planId: tenants.planId,
            storagePlanId: tenants.storagePlanId,
            tenantStatus: tenants.status,
            createdAt: tenantMemberships.createdAt,
          })
          .from(tenantMemberships)
          .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
          .where(eq(tenantMemberships.userId, userId))
          .orderBy(desc(tenantMemberships.updatedAt)),
        db
          .select({
            providerId: authAccounts.providerId,
            createdAt: authAccounts.createdAt,
            updatedAt: authAccounts.updatedAt,
          })
          .from(authAccounts)
          .where(eq(authAccounts.userId, userId)),
        db
          .select({
            id: authSessions.id,
            activeTenantId: authSessions.activeTenantId,
            ipAddress: authSessions.ipAddress,
            userAgent: authSessions.userAgent,
            createdAt: authSessions.createdAt,
            updatedAt: authSessions.updatedAt,
            expiresAt: authSessions.expiresAt,
          })
          .from(authSessions)
          .where(eq(authSessions.userId, userId))
          .orderBy(desc(authSessions.createdAt))
          .limit(50),
        db
          .select()
          .from(platformActivityEvents)
          .where(eq(platformActivityEvents.userId, userId))
          .orderBy(desc(platformActivityEvents.occurredAt))
          .limit(100),
        db
          .select({
            id: apnsDevices.id,
            environment: apnsDevices.environment,
            locale: apnsDevices.locale,
            appVersion: apnsDevices.appVersion,
            enabled: apnsDevices.enabled,
            lastSeenAt: apnsDevices.lastSeenAt,
            createdAt: apnsDevices.createdAt,
          })
          .from(apnsDevices)
          .where(eq(apnsDevices.userId, userId))
          .orderBy(desc(apnsDevices.lastSeenAt)),
        db
          .select({
            tenantId: tenants.id,
            tenantName: tenants.name,
            tenantSlug: tenants.slug,
            planId: tenants.planId,
            subscriptionId: creemSubscriptions.id,
            productId: creemSubscriptions.productId,
            status: creemSubscriptions.status,
            periodStart: creemSubscriptions.periodStart,
            periodEnd: creemSubscriptions.periodEnd,
            cancelAtPeriodEnd: creemSubscriptions.cancelAtPeriodEnd,
          })
          .from(tenantMemberships)
          .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
          .leftJoin(creemSubscriptions, eq(creemSubscriptions.tenantId, tenants.id))
          .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.role, 'owner')))
          .orderBy(desc(creemSubscriptions.updatedAt)),
        Promise.all([
          db.select({ total: count() }).from(comments).where(eq(comments.userId, userId)),
          db.select({ total: count() }).from(commentReactions).where(eq(commentReactions.userId, userId)),
          db
            .select({ total: count() })
            .from(gallerySubscriptions)
            .where(eq(gallerySubscriptions.subscriberUserId, userId)),
        ]),
        Promise.all([
          db
            .select({ activityCount: count(), lastSeenAt: max(platformActivityEvents.occurredAt) })
            .from(platformActivityEvents)
            .where(and(eq(platformActivityEvents.userId, userId), eq(platformActivityEvents.surface, 'mobile'))),
          db
            .select({ deviceCount: count(), lastSeenAt: max(apnsDevices.lastSeenAt) })
            .from(apnsDevices)
            .where(eq(apnsDevices.userId, userId)),
          db
            .select({ appVersion: platformActivityEvents.appVersion })
            .from(platformActivityEvents)
            .where(
              and(
                eq(platformActivityEvents.userId, userId),
                eq(platformActivityEvents.surface, 'mobile'),
                isNotNull(platformActivityEvents.appVersion),
              ),
            )
            .orderBy(desc(platformActivityEvents.occurredAt))
            .limit(1),
        ]),
      ])

    const mobileActivity = mobilePresence[0][0]
    const mobileDevices = mobilePresence[1][0]
    const mobileSummary = resolveMobileSummary({
      activityCount: Number(mobileActivity?.activityCount ?? 0),
      activityLastSeenAt: mobileActivity?.lastSeenAt ?? null,
      activityAppVersion: mobilePresence[2][0]?.appVersion ?? null,
      deviceCount: Number(mobileDevices?.deviceCount ?? 0),
      deviceLastSeenAt: mobileDevices?.lastSeenAt ?? null,
      deviceAppVersion: devices[0]?.appVersion ?? null,
    })

    return {
      user,
      memberships,
      accounts,
      sessions,
      activities,
      devices,
      mobileSummary,
      subscriptions,
      social: {
        comments: Number(socialCounts[0][0]?.total ?? 0),
        commentReactions: Number(socialCounts[1][0]?.total ?? 0),
        gallerySubscriptions: Number(socialCounts[2][0]?.total ?? 0),
      },
    }
  }

  async updateBan(userId: string, input: { banned: boolean, reason?: string | null, expiresAt?: string | null }) {
    const db = this.dbAccessor.get()
    const [before] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1)
    if (!before)
      throw new BizException(ErrorCode.COMMON_NOT_FOUND, { message: '用户不存在' })
    const [after] = await db
      .update(authUsers)
      .set({
        banned: input.banned,
        banReason: input.banned ? (input.reason ?? null) : null,
        banExpires: input.banned ? (input.expiresAt ?? null) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(authUsers.id, userId))
      .returning()
    return { before, after: after! }
  }

  async revokeSessions(userId: string): Promise<number> {
    const deleted = await this.dbAccessor
      .get()
      .delete(authSessions)
      .where(eq(authSessions.userId, userId))
      .returning({ id: authSessions.id })
    return deleted.length
  }

  private async getStats() {
    const db = this.dbAccessor.get()
    const now = Date.now()
    const day7 = new Date(now - 7 * 86_400_000).toISOString()
    const day30 = new Date(now - 30 * 86_400_000).toISOString()
    const day90 = new Date(now - 90 * 86_400_000).toISOString()
    const [row] = await db
      .select({
        totalUsers: count(),
        newUsers7d: sql<number>`count(*) filter (where ${authUsers.createdAt} >= ${day7})`,
        newUsers30d: sql<number>`count(*) filter (where ${authUsers.createdAt} >= ${day30})`,
        activeUsers7d: sql<number>`count(*) filter (where ${authUsers.lastActiveAt} >= ${day7})`,
        activeUsers30d: sql<number>`count(*) filter (where ${authUsers.lastActiveAt} >= ${day30})`,
        dormantUsers90d: sql<number>`count(*) filter (where ${authUsers.lastActiveAt} < ${day90} or ${authUsers.lastActiveAt} is null)`,
        verifiedUsers: sql<number>`count(*) filter (where ${authUsers.emailVerified} = true)`,
        bannedUsers: sql<number>`count(*) filter (where ${authUsers.banned} = true)`,
        deletingUsers: sql<number>`count(*) filter (where ${authUsers.deletionRequestedAt} is not null)`,
      })
      .from(authUsers)
    return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [key, Number(value ?? 0)]))
  }
}
