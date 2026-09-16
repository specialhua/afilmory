import { authUsers, platformActivityEvents, tenantMemberships } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { injectable } from 'tsyringe'

export const ACTIVITY_SURFACES = ['web', 'mobile', 'dashboard'] as const
export type ActivitySurface = (typeof ACTIVITY_SURFACES)[number]

@injectable()
export class ActivityService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async record(input: {
    userId: string
    tenantId?: string | null
    sessionId?: string | null
    eventType: string
    surface: ActivitySurface
    appVersion?: string | null
    metadata?: Record<string, unknown> | null
    occurredAt?: string
  }): Promise<void> {
    const db = this.dbAccessor.get()
    const occurredAt = input.occurredAt ?? new Date().toISOString()

    await db.transaction(async (tx) => {
      await tx.insert(platformActivityEvents).values({
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        sessionId: input.sessionId ?? null,
        eventType: input.eventType,
        surface: input.surface,
        appVersion: input.appVersion ?? null,
        metadata: input.metadata ?? null,
        occurredAt,
      })
      await tx
        .update(authUsers)
        .set({ lastActiveAt: occurredAt, lastActiveSurface: input.surface })
        .where(eq(authUsers.id, input.userId))
    })
  }

  async touch(input: {
    userId: string
    tenantId?: string | null
    sessionId?: string | null
    surface: ActivitySurface
    appVersion?: string | null
  }): Promise<void> {
    const db = this.dbAccessor.get()
    const now = new Date()
    const occurredAt = now.toISOString()
    const staleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString()

    const updated = await db
      .update(authUsers)
      .set({ lastActiveAt: occurredAt, lastActiveSurface: input.surface })
      .where(
        and(
          eq(authUsers.id, input.userId),
          or(lt(authUsers.lastActiveAt, staleBefore), isNull(authUsers.lastActiveAt)),
        ),
      )
      .returning({ id: authUsers.id })

    if (updated.length === 0) {
      return
    }

    const attributedTenantId
      = input.tenantId && (await this.canAttributeTenant(input.userId, input.tenantId)) ? input.tenantId : null

    await db.insert(platformActivityEvents).values({
      userId: input.userId,
      tenantId: attributedTenantId,
      sessionId: input.sessionId ?? null,
      eventType: 'app.active',
      surface: input.surface,
      appVersion: input.appVersion ?? null,
      occurredAt,
    })
  }

  async canAttributeTenant(userId: string, tenantId: string): Promise<boolean> {
    const [membership] = await this.dbAccessor
      .get()
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.userId, userId),
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .limit(1)
    return Boolean(membership)
  }
}
