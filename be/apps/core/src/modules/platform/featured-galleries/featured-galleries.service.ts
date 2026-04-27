import { authUsers, photoAssets, settings, tenantDomains, tenants } from '@afilmory/db'
import { DbAccessor } from '@core/database/database.provider'
import { normalizeDate } from '@core/helpers/normalize.helper'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'

@injectable()
export class FeaturedGalleriesService {
  constructor(private readonly dbAccessor: DbAccessor) {}

  async listFeaturedGalleries() {
    const db = this.dbAccessor.get()

    // Step 1: Calculate quality scores for all valid tenants with photos
    // Quality score formula:
    // - Photo count: 1 point per photo
    // - Total size: 0.1 points per MB (indicates high quality images)
    // - EXIF info: 2 points per photo with EXIF data (indicates professional shooting)
    // - Unique tags: 5 points per unique tag (indicates content diversity)
    // - GPS info: 1 point per photo with GPS (indicates complete metadata)
    const qualityScores = await db.execute<{
      tenant_id: string
      photo_count: number
      total_size_bytes: number
      exif_count: number
      unique_tag_count: number
      gps_count: number
      quality_score: number
    }>(sql`
      with tenant_quality as (
        select
          ${photoAssets.tenantId} as tenant_id,
          count(*)::int as photo_count,
          coalesce(sum(${photoAssets.size}), 0)::bigint as total_size_bytes,
          count(case when ${photoAssets.manifest}->'data'->'exif'->>'Make' is not null 
                     and ${photoAssets.manifest}->'data'->'exif'->>'Make' != '' then 1 end)::int as exif_count,
          count(case when ${photoAssets.manifest}->'data'->'exif'->'GPSLatitude' is not null 
                     or ${photoAssets.manifest}->'data'->'exif'->'GPSLongitude' is not null then 1 end)::int as gps_count
        from ${photoAssets}
        where ${photoAssets.syncStatus} in ('synced', 'conflict')
        group by ${photoAssets.tenantId}
      ),
      tenant_tags as (
        select
          ${photoAssets.tenantId} as tenant_id,
          count(distinct tag)::int as unique_tag_count
        from ${photoAssets},
        lateral jsonb_array_elements_text(${photoAssets.manifest}->'data'->'tags') as tag
        where ${photoAssets.syncStatus} in ('synced', 'conflict')
          and nullif(trim(tag), '') is not null
        group by ${photoAssets.tenantId}
      ),
      tenant_scores as (
        select
          tq.tenant_id,
          tq.photo_count,
          tq.total_size_bytes,
          tq.exif_count,
          coalesce(tt.unique_tag_count, 0) as unique_tag_count,
          tq.gps_count,
          -- Quality score calculation
          (tq.photo_count * 1.0 +                                    -- Photo count: 1 point each
           (tq.total_size_bytes / 1024.0 / 1024.0) * 0.1 +          -- Size: 0.1 points per MB
           tq.exif_count * 2.0 +                                     -- EXIF: 2 points each
           coalesce(tt.unique_tag_count, 0) * 5.0 +                 -- Tags: 5 points each
           tq.gps_count * 1.0) as quality_score                      -- GPS: 1 point each
        from tenant_quality tq
        left join tenant_tags tt on tq.tenant_id = tt.tenant_id
        where tq.photo_count > 0
      )
      select * from tenant_scores
      order by quality_score desc
      limit 20
    `)

    if (qualityScores.rows.length === 0) {
      return { galleries: [] }
    }

    const topTenantIds = qualityScores.rows.map((row) => row.tenant_id)
    const scoreMap = new Map(
      qualityScores.rows.map((row) => [
        row.tenant_id,
        {
          photoCount: row.photo_count,
          totalSizeBytes: row.total_size_bytes,
          exifCount: row.exif_count,
          uniqueTagCount: row.unique_tag_count,
          gpsCount: row.gps_count,
          qualityScore: row.quality_score,
        },
      ]),
    )

    // Step 2: Fetch tenant basic info
    const tenantRecords = await db
      .select()
      .from(tenants)
      .where(and(inArray(tenants.id, topTenantIds), eq(tenants.banned, false), eq(tenants.status, 'active')))

    // Filter out root and placeholder
    const validTenants = tenantRecords.filter((t) => t.slug !== 'root' && t.slug !== 'placeholder')

    if (validTenants.length === 0) {
      return { galleries: [] }
    }

    const finalTenantIds = validTenants.map((t) => t.id)

    // Step 3: Fetch all related data in parallel
    const [siteSettings, authors, domains, lastUpdatedRows] = await Promise.all([
      // Site settings
      db
        .select()
        .from(settings)
        .where(
          and(inArray(settings.tenantId, finalTenantIds), inArray(settings.key, ['site.name', 'site.description'])),
        ),
      // Primary authors
      db
        .select({
          tenantId: authUsers.tenantId,
          name: authUsers.name,
          image: authUsers.image,
        })
        .from(authUsers)
        .where(inArray(authUsers.tenantId, finalTenantIds))
        .orderBy(
          sql`case when ${authUsers.role} = 'admin' then 0 when ${authUsers.role} = 'superadmin' then 1 else 2 end`,
          asc(authUsers.createdAt),
        ),
      // Verified domains
      db
        .select({
          tenantId: tenantDomains.tenantId,
          domain: tenantDomains.domain,
        })
        .from(tenantDomains)
        .where(and(inArray(tenantDomains.tenantId, finalTenantIds), eq(tenantDomains.status, 'verified'))),
      // Last photo library update time per tenant
      db
        .select({
          tenantId: photoAssets.tenantId,
          lastUpdatedAt: sql<Date>`max(${photoAssets.updatedAt})`,
        })
        .from(photoAssets)
        .where(
          and(inArray(photoAssets.tenantId, finalTenantIds), inArray(photoAssets.syncStatus, ['synced', 'conflict'])),
        )
        .groupBy(photoAssets.tenantId),
    ])

    // Step 4: Fetch popular tags for top tenants (batch query)
    const tagMap = new Map<string, string[]>()
    for (const tenantId of finalTenantIds) {
      const tagsResult = await db.execute<{ tag: string | null; count: number | null }>(sql`
        select tag, count(*)::int as count
        from (
          select nullif(trim(jsonb_array_elements_text(${photoAssets.manifest}->'data'->'tags')), '') as tag
          from ${photoAssets}
          where ${photoAssets.tenantId} = ${tenantId}
            and ${photoAssets.syncStatus} in ('synced', 'conflict')
        ) as tag_items
        where tag is not null and tag != ''
        group by tag
        order by count desc
        limit 5
      `)

      const tags = tagsResult.rows
        .map((row) => {
          const tag = row.tag?.trim()
          return tag && tag.length > 0 ? tag : null
        })
        .filter((tag): tag is string => tag !== null)

      if (tags.length > 0) {
        tagMap.set(tenantId, tags)
      }
    }

    // Step 5: Build lookup maps
    const settingsMap = new Map<string, Map<string, string | null>>()
    for (const setting of siteSettings) {
      if (!settingsMap.has(setting.tenantId)) {
        settingsMap.set(setting.tenantId, new Map())
      }
      settingsMap.get(setting.tenantId)!.set(setting.key, setting.value)
    }

    const authorMap = new Map<string, { name: string; avatar: string | null }>()
    for (const author of authors) {
      if (!authorMap.has(author.tenantId!)) {
        authorMap.set(author.tenantId!, {
          name: author.name,
          avatar: author.image ?? null,
        })
      }
    }

    const domainMap = new Map<string, string>()
    const lastUpdatedMap = new Map<string, Date | null>()
    for (const domain of domains) {
      if (!domainMap.has(domain.tenantId)) {
        domainMap.set(domain.tenantId, domain.domain)
      }
    }

    for (const row of lastUpdatedRows) {
      lastUpdatedMap.set(row.tenantId, row.lastUpdatedAt)
    }

    // Step 6: Build response sorted by quality score
    const featuredGalleries = validTenants
      .map((tenant) => {
        const tenantSettings = settingsMap.get(tenant.id) ?? new Map()
        const author = authorMap.get(tenant.id)
        const domain = domainMap.get(tenant.id)
        const tags = tagMap.get(tenant.id) ?? []
        const score = scoreMap.get(tenant.id)

        return {
          id: tenant.id,
          name: tenantSettings.get('site.name') ?? tenant.name,
          slug: tenant.slug,
          domain: domain ?? null,
          description: tenantSettings.get('site.description') ?? null,
          author: author
            ? {
                name: author.name,
                avatar: author.avatar,
              }
            : null,
          photoCount: score?.photoCount ?? 0,
          tags,
          createdAt: normalizeDate(tenant.createdAt),
          lastUpload:
            normalizeDate(lastUpdatedMap.get(tenant.id) ?? undefined) ??
            lastUpdatedMap.get(tenant.id) ??
            normalizeDate(tenant.createdAt),
        }
      })
      .filter((gallery) => gallery.photoCount > 0)
      .sort((a, b) => {
        const scoreA = scoreMap.get(a.id)?.qualityScore ?? 0
        const scoreB = scoreMap.get(b.id)?.qualityScore ?? 0
        return scoreB - scoreA
      })

    return {
      galleries: featuredGalleries,
    }
  }
}
