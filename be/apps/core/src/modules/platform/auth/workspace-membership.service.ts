import { authSessions, tenantMemberships, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { BizException, ErrorCode } from '@core/errors'
import { and, desc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'

export type WorkspaceMembershipRole = typeof tenantMemberships.$inferSelect.role
export type WorkspaceMembershipStatus = typeof tenantMemberships.$inferSelect.status
export type WorkspaceMembership = typeof tenantMemberships.$inferSelect
export type WorkspaceSummary = typeof tenants.$inferSelect

export interface WorkspaceMembershipSummary {
  id: string
  role: WorkspaceMembershipRole
  status: WorkspaceMembershipStatus
  workspace: WorkspaceSummary
}

@injectable()
export class WorkspaceMembershipService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async findMembership(userId: string, tenantId: string): Promise<WorkspaceMembership | null> {
    const db = this.dbAccessor.get()
    const [membership] = await db
      .select()
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId)))
      .limit(1)

    return membership ?? null
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<WorkspaceMembership | null> {
    const db = this.dbAccessor.get()
    const [membership] = await db
      .select()
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.userId, userId),
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .limit(1)

    return membership ?? null
  }

  async listForUser(userId: string): Promise<WorkspaceMembershipSummary[]> {
    const db = this.dbAccessor.get()
    const rows = await db
      .select({
        membership: tenantMemberships,
        workspace: tenants,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
      .where(eq(tenantMemberships.userId, userId))
      .orderBy(desc(tenantMemberships.updatedAt), desc(tenantMemberships.createdAt))

    return rows.map(({ membership, workspace }) => ({
      id: membership.id,
      role: membership.role,
      status: membership.status,
      workspace,
    }))
  }

  async listActiveForUser(userId: string): Promise<WorkspaceMembershipSummary[]> {
    const memberships = await this.listForUser(userId)
    return memberships.filter(({ status }) => status === 'active')
  }

  async createOwnerMembership(userId: string, tenantId: string): Promise<WorkspaceMembership> {
    const db = this.dbAccessor.get()
    const [membership] = await db
      .insert(tenantMemberships)
      .values({
        userId,
        tenantId,
        role: 'owner',
        status: 'active',
      })
      .returning()

    if (!membership) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'Failed to create the workspace owner membership.',
      })
    }

    return membership
  }

  async ensureOwnerMembership(userId: string, tenantId: string): Promise<WorkspaceMembership> {
    const existing = await this.findMembership(userId, tenantId)
    if (existing?.role === 'owner' && existing.status === 'active') {
      return existing
    }

    const db = this.dbAccessor.get()
    const [membership] = existing
      ? await db
          .update(tenantMemberships)
          .set({
            role: 'owner',
            status: 'active',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tenantMemberships.id, existing.id))
          .returning()
      : await db
          .insert(tenantMemberships)
          .values({
            userId,
            tenantId,
            role: 'owner',
            status: 'active',
          })
          .returning()

    if (!membership) {
      throw new BizException(ErrorCode.COMMON_CONFLICT, {
        message: 'Failed to ensure the workspace owner membership.',
      })
    }

    return membership
  }

  async resolveInitialActiveTenantId(userId: string, requestedTenantId?: string | null): Promise<string | null> {
    if (requestedTenantId) {
      const requestedMembership = await this.findActiveMembership(userId, requestedTenantId)
      if (requestedMembership) {
        return requestedTenantId
      }
    }

    const memberships = await this.listActiveForUser(userId)
    return memberships[0]?.workspace.id ?? null
  }

  async switchActiveWorkspace(params: {
    sessionId: string
    userId: string
    tenantId: string
  }): Promise<WorkspaceMembershipSummary> {
    const membership = await this.findActiveMembership(params.userId, params.tenantId)
    if (!membership) {
      throw new BizException(ErrorCode.AUTH_FORBIDDEN, {
        message: 'The current user does not have an active membership in this workspace.',
      })
    }

    const db = this.dbAccessor.get()
    const [workspace] = await db.select().from(tenants).where(eq(tenants.id, params.tenantId)).limit(1)
    if (!workspace) {
      throw new BizException(ErrorCode.TENANT_NOT_FOUND)
    }

    const [session] = await db
      .update(authSessions)
      .set({
        activeTenantId: params.tenantId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(authSessions.id, params.sessionId), eq(authSessions.userId, params.userId)))
      .returning({ id: authSessions.id })

    if (!session) {
      throw new BizException(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'The current session is no longer available.',
      })
    }

    return {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      workspace,
    }
  }

  async setSessionActiveWorkspace(params: {
    sessionId: string
    userId: string
    tenantId: string | null
  }): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(authSessions)
      .set({
        activeTenantId: params.tenantId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(authSessions.id, params.sessionId), eq(authSessions.userId, params.userId)))
  }

  async setSessionActiveWorkspaceByToken(params: { token: string; userId: string; tenantId: string }): Promise<void> {
    const db = this.dbAccessor.get()
    await db
      .update(authSessions)
      .set({
        activeTenantId: params.tenantId,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(authSessions.token, params.token), eq(authSessions.userId, params.userId)))
  }

  async isWorkspaceAdmin(userId: string, tenantId: string): Promise<boolean> {
    const membership = await this.findActiveMembership(userId, tenantId)
    return membership?.role === 'admin' || membership?.role === 'owner'
  }
}
