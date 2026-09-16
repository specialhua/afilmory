import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FetchError } from 'ofetch'
import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useSetAuthUser } from '~/atoms/auth'
import { PUBLIC_ROUTES, ROUTE_PATHS } from '~/constants/routes'
import type { SessionResponse } from '~/modules/auth/api/session'
import { AUTH_SESSION_QUERY_KEY, fetchSession } from '~/modules/auth/api/session'
import { signOutBySource } from '~/modules/auth/auth-client'
import { buildTenantUrl, getTenantSlugFromHost } from '~/modules/auth/utils/domain'

const AUTH_FAILURE_STATUSES = new Set([401, 403, 419])
const AUTH_TENANT_NOT_FOUND_ERROR_CODE = 12
const TENANT_NOT_FOUND_ERROR_CODE = 20
const TENANT_MISSING_ERROR_CODES = new Set([AUTH_TENANT_NOT_FOUND_ERROR_CODE, TENANT_NOT_FOUND_ERROR_CODE])
const {
  LOGIN: DEFAULT_LOGIN_PATH,
  ROOT_LOGIN: ROOT_LOGIN_PATH,
  WELCOME: WELCOME_PATH,
  TENANT_MISSING: TENANT_MISSING_PATH,
  NO_ACCESS: NO_ACCESS_PATH,
  DEFAULT_AUTHENTICATED: DEFAULT_AUTHENTICATED_PATH,
  SUPERADMIN_ROOT: SUPERADMIN_ROOT_PATH,
  SUPERADMIN_DEFAULT: SUPERADMIN_DEFAULT_PATH,
} = ROUTE_PATHS

type BizErrorPayload = { code?: number | string }
type FetchErrorWithPayload = FetchError<BizErrorPayload> & {
  response?: {
    _data?: BizErrorPayload
  }
}

function extractBizErrorCode(error: unknown): number | null {
  if (!(error instanceof FetchError)) {
    return null
  }

  const { data, response } = error as FetchErrorWithPayload
  const payload = data ?? response?._data

  const codeValue = payload?.code
  if (typeof codeValue === 'number') {
    return Number.isFinite(codeValue) ? codeValue : null
  }

  if (typeof codeValue === 'string') {
    const parsed = Number.parseInt(codeValue, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

export function usePageRedirect() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setAuthUser = useSetAuthUser()

  const sessionQuery = useQuery<SessionResponse | null>({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchSession()
      }
      catch (error) {
        if (error instanceof FetchError) {
          const status = error.statusCode ?? error.response?.status ?? null
          if (status && AUTH_FAILURE_STATUSES.has(status)) {
            return null
          }
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const logout = useCallback(async () => {
    try {
      await signOutBySource()
    }
    catch (error) {
      console.error('Logout error:', error)
    }
    finally {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null)
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY })
      setAuthUser(null)
      navigate(DEFAULT_LOGIN_PATH, { replace: true })
    }
  }, [navigate, queryClient, setAuthUser])

  // Sync auth user to atom
  useEffect(() => {
    setAuthUser(sessionQuery.data?.user ?? null)
  }, [sessionQuery.data, setAuthUser])

  useEffect(() => {
    const matchedTenantNotFound = [sessionQuery.error].some((error) => {
      const code = extractBizErrorCode(error)
      return code !== null && TENANT_MISSING_ERROR_CODES.has(code)
    })

    if (!matchedTenantNotFound) {
      return
    }

    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null)
    setAuthUser(null)

    if (location.pathname !== TENANT_MISSING_PATH) {
      navigate(TENANT_MISSING_PATH, { replace: true })
    }
  }, [location.pathname, navigate, queryClient, sessionQuery.error, setAuthUser])

  useEffect(() => {
    if (sessionQuery.isPending) {
      return
    }

    if (sessionQuery.isError) {
      return
    }

    const { pathname } = location
    const session = sessionQuery.data
    const isSuperAdmin = session?.user.role === 'superadmin'
    const isOnSuperAdminPage = pathname.startsWith(SUPERADMIN_ROOT_PATH)
    const isOnRootLoginPage = pathname === ROOT_LOGIN_PATH
    const requestedWorkspace = session?.requestedWorkspace ?? null
    const requestedMembership = session?.requestedMembership ?? null
    const isTenantPending = Boolean(session && requestedWorkspace?.isPlaceholder)
    const canManageRequestedWorkspace
      = requestedMembership?.status === 'active'
        && (requestedMembership.role === 'admin' || requestedMembership.role === 'owner')
    const isOnWelcomePage = pathname === WELCOME_PATH

    if (session && isSuperAdmin) {
      if (!isOnSuperAdminPage || pathname === DEFAULT_LOGIN_PATH || isOnRootLoginPage) {
        navigate(SUPERADMIN_DEFAULT_PATH, { replace: true })
      }
      return
    }

    if (session && isTenantPending) {
      if (!isOnWelcomePage) {
        navigate(WELCOME_PATH, { replace: true })
      }
      return
    }

    if (
      session
      && requestedWorkspace
      && !requestedWorkspace.isPlaceholder
      && !canManageRequestedWorkspace
      && !PUBLIC_ROUTES.has(pathname)
    ) {
      navigate(NO_ACCESS_PATH, { replace: true })
      return
    }

    if (session && !isTenantPending && isOnWelcomePage) {
      navigate(DEFAULT_AUTHENTICATED_PATH, { replace: true })
      return
    }

    if (session && !isSuperAdmin && isOnSuperAdminPage) {
      navigate(DEFAULT_AUTHENTICATED_PATH, { replace: true })
      return
    }

    if (!session && !PUBLIC_ROUTES.has(pathname)) {
      navigate(DEFAULT_LOGIN_PATH, { replace: true })
      return
    }

    if (session && (pathname === DEFAULT_LOGIN_PATH || pathname === ROOT_LOGIN_PATH)) {
      const destination
        = isTenantPending || (!requestedWorkspace && !session.activeWorkspace)
          ? WELCOME_PATH
          : requestedWorkspace && !canManageRequestedWorkspace
            ? NO_ACCESS_PATH
            : DEFAULT_AUTHENTICATED_PATH
      navigate(destination, { replace: true })
    }
  }, [location, location.pathname, navigate, sessionQuery.data, sessionQuery.isError, sessionQuery.isPending])

  useEffect(() => {
    if (sessionQuery.isPending) {
      return
    }

    const session = sessionQuery.data
    if (!session || session.user.role === 'superadmin') {
      return
    }

    if (session.requestedWorkspace) {
      return
    }

    const activeWorkspace = session.activeWorkspace
    if (!activeWorkspace?.slug) {
      return
    }

    const currentSlug = getTenantSlugFromHost(window.location.hostname)
    if (currentSlug === activeWorkspace.slug) {
      return
    }

    try {
      window.location.replace(buildTenantUrl(activeWorkspace.slug, '/'))
    }
    catch (error) {
      console.error('Failed to redirect to tenant workspace', error)
    }
  }, [sessionQuery.data, sessionQuery.isPending])

  return {
    sessionQuery,

    logout,
    isAuthenticated: !!sessionQuery.data,
    user: sessionQuery.data?.user,
  }
}
