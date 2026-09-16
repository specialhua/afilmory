const TEAM_APP_ID = 'KAMM5N88X3.app.afilmory'

const NATIVE_ROUTE_PATHS = ['/photos', '/map', '/explore', '/studio', '/studio/*']

const TENANT_ROUTE_PATHS = ['/', '/photos/*', ...NATIVE_ROUTE_PATHS]

function buildAssociation(paths: readonly string[]) {
  return {
    applinks: {
      details: [
        {
          appIDs: [TEAM_APP_ID],
          components: paths.map(path => ({ '/': path })),
        },
      ],
    },
    webcredentials: {
      apps: [TEAM_APP_ID],
    },
  }
}

export const APPLE_APP_SITE_ASSOCIATION = buildAssociation(TENANT_ROUTE_PATHS)

export const LANDING_APPLE_APP_SITE_ASSOCIATION = buildAssociation(NATIVE_ROUTE_PATHS)

export function appleAppSiteAssociationResponse(): Response {
  return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  })
}
