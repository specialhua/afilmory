import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PhotoManifestItem } from '@afilmory/builder'
import { SiteSettingService } from '@core/modules/configuration/site-setting/site-setting.service'
import { PhotoAssetService } from '@core/modules/content/photo/assets/photo-asset.service'
import type { Context } from 'hono'
import { DOMParser } from 'linkedom'
import { injectable } from 'tsyringe'

import type { StaticAssetDocument } from './static-asset.service'
import { StaticAssetService } from './static-asset.service'
import { StaticAssetHostService } from './static-asset-host.service'

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url))

const STATIC_SHARE_ROUTE_SEGMENT = '/static/web'
export const STATIC_SHARE_ENTRY_PATH = `${STATIC_SHARE_ROUTE_SEGMENT}/share.html`

const STATIC_SHARE_ROOT_CANDIDATES = Array.from(
  new Set(
    [
      resolve(MODULE_DIR, '../../static/web'),
      resolve(process.cwd(), 'dist/static/web'),
      resolve(process.cwd(), '../dist/static/web'),
      resolve(process.cwd(), '../../dist/static/web'),
      resolve(process.cwd(), '../../../dist/static/web'),
      resolve(process.cwd(), 'static/web'),
      resolve(process.cwd(), '../static/web'),
      resolve(process.cwd(), '../../static/web'),
      resolve(process.cwd(), '../../../static/web'),
      resolve(process.cwd(), 'apps/web/dist'),
      resolve(process.cwd(), '../apps/web/dist'),
      resolve(process.cwd(), '../../apps/web/dist'),
      resolve(process.cwd(), '../../../apps/web/dist'),
    ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ),
)

const DOM_PARSER = new DOMParser()
const STATIC_SHARE_ASSET_LINK_RELS = [
  'stylesheet',
  'modulepreload',
  'preload',
  'prefetch',
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'manifest',
]

type TenantSiteConfig = Awaited<ReturnType<SiteSettingService['getSiteConfig']>>

@injectable()
export class StaticShareService extends StaticAssetService {
  constructor(
    private readonly photoAssetService: PhotoAssetService,
    private readonly siteSettingService: SiteSettingService,
    private readonly staticAssetHostService: StaticAssetHostService,
  ) {
    super({
      routeSegment: STATIC_SHARE_ROUTE_SEGMENT,
      rootCandidates: STATIC_SHARE_ROOT_CANDIDATES,
      assetLinkRels: STATIC_SHARE_ASSET_LINK_RELS,
      loggerName: 'StaticShareService',
      staticAssetHostResolver: (requestHost) => this.staticAssetHostService.getStaticAssetHost(requestHost),
    })
  }

  protected override async decorateDocument(_document: StaticAssetDocument): Promise<void> {
    // Share page will have data injected dynamically per request
    // No default decoration needed here
  }

  async decorateSharePageResponse(context: Context, photoIds: string, response: Response): Promise<Response> {
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('text/html')) {
      return response
    }

    const html = await response.text()
    const headers = new Headers(response.headers)

    // Parse photo IDs (comma-separated)
    const ids = photoIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (ids.length === 0) {
      return this.createManualHtmlResponse(html, headers, 400)
    }

    // Find photos from database
    const photos = await this.findPhotosByIds(ids)

    if (photos.length === 0) {
      return this.createManualHtmlResponse(html, headers, 404)
    }

    const siteConfig = await this.siteSettingService.getSiteConfig()

    try {
      const document = DOM_PARSER.parseFromString(html, 'text/html') as unknown as StaticAssetDocument
      this.injectSharePageData(document, photos, siteConfig)

      const serialized = document.documentElement.outerHTML
      return this.createManualHtmlResponse(serialized, headers, 200)
    } catch (error) {
      this.logger.error('Failed to inject data for share page', { error })
      return this.createManualHtmlResponse(html, headers, response.status)
    }
  }

  private injectSharePageData(
    document: StaticAssetDocument,
    photos: PhotoManifestItem[],
    siteConfig: TenantSiteConfig,
  ): void {
    // Inject config script
    const configScript = document.head?.querySelector('#config')
    if (configScript) {
      const payload = JSON.stringify({
        useCloud: true,
      })
      const siteConfigPayload = JSON.stringify(siteConfig)
      configScript.textContent = `window.__CONFIG__ = ${payload};window.__SITE_CONFIG__ = ${siteConfigPayload}`
    }

    // Inject share data
    const manifestScript = document.head?.querySelector('#manifest')
    if (manifestScript) {
      const shareData = photos.length === 1 ? photos[0] : photos
      manifestScript.textContent = `window.__SHARE_DATA__ = ${JSON.stringify(shareData)};`
    }
  }

  private async findPhotosByIds(photoIds: string[]): Promise<PhotoManifestItem[]> {
    return await this.photoAssetService.findPhotosByIds(photoIds)
  }

  private createManualHtmlResponse(html: string, baseHeaders: Headers, status: number): Response {
    const headers = new Headers(baseHeaders)
    headers.set('content-length', Buffer.byteLength(html, 'utf8').toString())
    return new Response(html, { status, headers })
  }
}
