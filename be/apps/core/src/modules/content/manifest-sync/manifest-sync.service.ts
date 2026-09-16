import type { PhotoManifestItem } from '@afilmory/builder'
import type { ManifestChangePayload } from '@afilmory/db'
import { photoAssets, tenantManifestChanges, tenantManifestStates } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import type { DrizzleDb } from '@core/database/tokens'
import { requireTenantContext } from '@core/modules/platform/tenant/tenant.context'
import { EventEmitterService } from '@tsuki-hono/event-emitter'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import { injectable } from 'tsyringe'

import type { PhotoChange } from './manifest-sync.types'
import {
  isChangeCursorExpired,
  isPublishedSyncStatus,
  MANIFEST_CHANGE_PAGE_SIZE,
  MANIFEST_CHANGE_RETENTION,
  toPhotoChange,
} from './manifest-sync.types'

type PhotoAssetRow = typeof photoAssets.$inferSelect

export type AppliedManifestAction = {
  type: string
  applied: boolean
  photoId: string | null
  storageKey: string
}

export type ManifestChangeDraft
  = | {
    operation: 'upsert'
    record: PhotoAssetRow
    publicUrl?: string | null
  }
  | {
    operation: 'delete'
    photoId: string
    assetId?: string | null
  }

@injectable()
export class ManifestSyncService {
  constructor(
    private readonly dbAccessor: DbAccessor,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async getRevision(tenantId?: string): Promise<number> {
    const id = tenantId ?? requireTenantContext().tenant.id
    const db = this.dbAccessor.get()
    const [row] = await db
      .select({ revision: tenantManifestStates.revision })
      .from(tenantManifestStates)
      .where(eq(tenantManifestStates.tenantId, id))
      .limit(1)
    return row?.revision ?? 0
  }

  async listChanges(
    after: number,
    tenantId?: string,
  ): Promise<{
    revision: number
    expired: boolean
    changes: PhotoChange[]
  }> {
    const id = tenantId ?? requireTenantContext().tenant.id
    const db = this.dbAccessor.get()
    const revision = await this.getRevision(id)
    if (after >= revision) {
      return { revision, expired: false, changes: [] }
    }

    const [oldest] = await db
      .select({ revision: tenantManifestChanges.revision })
      .from(tenantManifestChanges)
      .where(eq(tenantManifestChanges.tenantId, id))
      .orderBy(asc(tenantManifestChanges.revision))
      .limit(1)

    if (isChangeCursorExpired(after, oldest?.revision ?? null)) {
      return { revision, expired: true, changes: [] }
    }

    const rows = await db
      .select()
      .from(tenantManifestChanges)
      .where(and(eq(tenantManifestChanges.tenantId, id), gt(tenantManifestChanges.revision, after)))
      .orderBy(asc(tenantManifestChanges.revision))
      .limit(MANIFEST_CHANGE_PAGE_SIZE)

    return {
      revision,
      expired: false,
      changes: rows.map(row => toPhotoChange({ tenantId: id, revision: row.revision, payload: row.payload })),
    }
  }

  async recordDrafts(tenantId: string, drafts: ManifestChangeDraft[]): Promise<PhotoChange[]> {
    if (drafts.length === 0) {
      return []
    }
    const db = this.dbAccessor.get()
    const changes = await db.transaction(async (tx) => {
      return await this.recordDraftsOn(tx, tenantId, drafts)
    })
    this.emitChanged(tenantId, changes)
    return changes
  }

  emitChanged(tenantId: string, changes: PhotoChange[]): void {
    const latest = changes.at(-1)
    if (!latest) {
      return
    }
    void this.eventEmitter.emit('photo.manifest.changed', { tenantId, revision: latest.revision })
  }

  async recordUpsert(record: PhotoAssetRow, publicUrl?: string | null): Promise<PhotoChange> {
    const [change] = await this.recordDrafts(record.tenantId, [{ operation: 'upsert', record, publicUrl }])
    return change
  }

  async recordDeletes(tenantId: string, records: Array<{ id: string, photoId: string }>): Promise<PhotoChange[]> {
    return await this.recordDrafts(
      tenantId,
      records.map(record => ({
        operation: 'delete' as const,
        photoId: record.photoId,
        assetId: record.id,
      })),
    )
  }

  async recordAppliedActions(tenantId: string, actions: AppliedManifestAction[]): Promise<PhotoChange[]> {
    const applied = actions.filter(
      action => action.applied && (action.type === 'insert' || action.type === 'update' || action.type === 'delete'),
    )
    if (applied.length === 0) {
      return []
    }

    const db = this.dbAccessor.get()
    const photoIds = [...new Set(applied.map(action => action.photoId).filter((id): id is string => Boolean(id)))]
    const records
      = photoIds.length === 0
        ? []
        : await db
            .select()
            .from(photoAssets)
            .where(and(eq(photoAssets.tenantId, tenantId), inArray(photoAssets.photoId, photoIds)))
    const recordsByPhotoId = new Map(records.map(record => [record.photoId, record]))

    const drafts: ManifestChangeDraft[] = []
    for (const action of applied) {
      if (action.type === 'delete') {
        drafts.push({
          operation: 'delete',
          photoId: action.photoId ?? action.storageKey,
          assetId: null,
        })
        continue
      }
      const record = action.photoId ? recordsByPhotoId.get(action.photoId) : undefined
      if (!record) {
        continue
      }
      drafts.push({ operation: 'upsert', record })
    }

    return await this.recordDrafts(tenantId, drafts)
  }

  async recordDraftsOn(tx: DrizzleDb, tenantId: string, drafts: ManifestChangeDraft[]): Promise<PhotoChange[]> {
    const now = new Date().toISOString()
    let revision = await this.lockRevision(tx, tenantId)
    if (revision == null) {
      await tx
        .insert(tenantManifestStates)
        .values({
          tenantId,
          revision: 0,
          updatedAt: now,
        })
        .onConflictDoNothing()
      revision = (await this.lockRevision(tx, tenantId)) ?? 0
    }

    const changes: PhotoChange[] = []
    for (const draft of drafts) {
      revision += 1
      const payload = this.createPayload(draft)
      await tx.insert(tenantManifestChanges).values({
        tenantId,
        revision,
        operation: payload.operation,
        photoId: payload.photoId,
        payload,
        createdAt: now,
      })
      changes.push(toPhotoChange({ tenantId, revision, payload }))
    }

    await tx
      .update(tenantManifestStates)
      .set({ revision, updatedAt: now })
      .where(eq(tenantManifestStates.tenantId, tenantId))

    const cutoff = revision - MANIFEST_CHANGE_RETENTION
    if (cutoff > 0) {
      await tx
        .delete(tenantManifestChanges)
        .where(and(eq(tenantManifestChanges.tenantId, tenantId), lte(tenantManifestChanges.revision, cutoff)))
    }

    return changes
  }

  private async lockRevision(tx: DrizzleDb, tenantId: string): Promise<number | null> {
    const [locked] = await tx
      .select({ revision: tenantManifestStates.revision })
      .from(tenantManifestStates)
      .where(eq(tenantManifestStates.tenantId, tenantId))
      .for('update')
    return locked?.revision ?? null
  }

  private createPayload(draft: ManifestChangeDraft): ManifestChangePayload {
    if (draft.operation === 'delete') {
      return {
        operation: 'delete',
        photoId: draft.photoId,
        assetId: draft.assetId ?? null,
        published: false,
        photo: null,
        asset: null,
      }
    }

    const photo = structuredClone(draft.record.manifest.data) as PhotoManifestItem
    const published = isPublishedSyncStatus(draft.record.syncStatus)
    return {
      operation: 'upsert',
      photoId: draft.record.photoId,
      assetId: draft.record.id,
      published,
      photo,
      asset: {
        id: draft.record.id,
        photoId: draft.record.photoId,
        storageKey: draft.record.storageKey,
        storageProvider: draft.record.storageProvider,
        syncStatus: draft.record.syncStatus,
        size: draft.record.size ?? null,
        createdAt: draft.record.createdAt,
        updatedAt: draft.record.updatedAt,
        syncedAt: draft.record.syncedAt,
        publicUrl: draft.publicUrl ?? photo.originalUrl ?? null,
      },
    }
  }
}
