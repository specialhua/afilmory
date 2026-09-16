import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  APPLE_APP_SITE_ASSOCIATION,
  appleAppSiteAssociationResponse,
  LANDING_APPLE_APP_SITE_ASSOCIATION,
} from './apple-app-site-association'

const TEAM_APP_ID = 'KAMM5N88X3.app.afilmory'

function pathsOf(association: typeof APPLE_APP_SITE_ASSOCIATION) {
  return association.applinks.details.flatMap(detail => detail.components.map(component => component['/']))
}

describe('apple-app-site-association', () => {
  it('binds Universal Links to the production iOS app id', () => {
    for (const association of [APPLE_APP_SITE_ASSOCIATION, LANDING_APPLE_APP_SITE_ASSOCIATION]) {
      expect(association.applinks.details.map(detail => detail.appIDs)).toEqual([[TEAM_APP_ID]])
    }
  })

  it('claims the tenant homepage and photo permalinks on gallery subdomains', () => {
    expect(pathsOf(APPLE_APP_SITE_ASSOCIATION)).toEqual([
      '/',
      '/photos/*',
      '/photos',
      '/map',
      '/explore',
      '/studio',
      '/studio/*',
    ])
  })

  it('does not claim the site homepage so the landing page stays in Safari', () => {
    const paths = pathsOf(LANDING_APPLE_APP_SITE_ASSOCIATION)

    expect(paths).not.toContain('/')
    expect(paths).not.toContain('/photos/*')
    expect(paths).not.toContain('/privacy')
    expect(paths).not.toContain('/support')
    expect(paths).not.toContain('/terms')
  })

  it('advertises webcredentials for Sign in with Apple', () => {
    expect(APPLE_APP_SITE_ASSOCIATION.webcredentials.apps).toEqual([TEAM_APP_ID])
  })

  it('returns JSON without wrapping or snake_case rewriting', async () => {
    const response = appleAppSiteAssociationResponse()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    await expect(response.json()).resolves.toEqual(APPLE_APP_SITE_ASSOCIATION)
  })

  it('matches the public static copies on the backend and landing site', () => {
    const copies = [
      ['public/.well-known/apple-app-site-association', APPLE_APP_SITE_ASSOCIATION],
      ['../../../apps/site/public/.well-known/apple-app-site-association', LANDING_APPLE_APP_SITE_ASSOCIATION],
      ['../../../apps/site/public/apple-app-site-association', LANDING_APPLE_APP_SITE_ASSOCIATION],
    ] as const

    for (const [file, association] of copies) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8').trim()).toBe(JSON.stringify(association))
    }
  })
})
