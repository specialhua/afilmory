import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@afilmory/ui'
import { ChevronLeftIcon, ChevronRightIcon, RefreshCcwIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { useSuperAdminUsersQuery } from '../hooks'
import type { SuperAdminUserStats, UserCommercialStatus } from '../types'

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string | null) {
  return value ? DATE_FORMATTER.format(new Date(value)) : '—'
}

export function SuperAdminUserManager() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'banned' | 'deleting'>('all')
  const [commercialStatus, setCommercialStatus] = useState<'all' | UserCommercialStatus>('all')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const query = useSuperAdminUsersQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: status === 'all' ? undefined : status,
    commercialStatus: commercialStatus === 'all' ? undefined : commercialStatus,
    sortBy: 'createdAt',
    sortDir: 'desc',
  })
  const users = query.data?.users ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="space-y-4">
      {query.isError ? (
        <LinearBorderPanel className="border-red/30 bg-red/5 p-4 text-sm text-red">
          {t('superadmin.users.error')}
        </LinearBorderPanel>
      ) : null}
      <UserStats stats={query.data?.stats} />
      <LinearBorderPanel className="bg-background-secondary p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <SearchIcon className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                value={search}
                placeholder={t('superadmin.users.search')}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={value => setStatus(value as typeof status)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('superadmin.users.filter.all')}</SelectItem>
                <SelectItem value="active">{t('superadmin.users.status.active')}</SelectItem>
                <SelectItem value="banned">{t('superadmin.users.status.banned')}</SelectItem>
                <SelectItem value="deleting">{t('superadmin.users.status.deleting')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={commercialStatus}
              onValueChange={value => setCommercialStatus(value as typeof commercialStatus)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('superadmin.users.commercial.all')}</SelectItem>
                <SelectItem value="none">{t('superadmin.users.commercial.none')}</SelectItem>
                <SelectItem value="free-owner">{t('superadmin.users.commercial.free-owner')}</SelectItem>
                <SelectItem value="paid-owner">{t('superadmin.users.commercial.paid-owner')}</SelectItem>
                <SelectItem value="paid-member">{t('superadmin.users.commercial.paid-member')}</SelectItem>
                <SelectItem value="mixed">{t('superadmin.users.commercial.mixed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}>
            <RefreshCcwIcon className="size-4" />
            {t('superadmin.users.refresh')}
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-border/40 text-sm">
            <thead>
              <tr className="text-text-tertiary text-left text-xs uppercase tracking-wide">
                <th className="px-3 py-2">{t('superadmin.users.table.user')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.status')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.workspaces')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.commercial')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.last-active')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.mobile')}</th>
                <th className="px-3 py-2">{t('superadmin.users.table.created')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-3 py-3">
                    <Link className="font-medium text-primary hover:underline" to={`/superadmin/users/${user.id}`}>
                      {user.name}
                    </Link>
                    <div className="text-text-secondary text-xs">{user.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <UserStatus user={user} />
                  </td>
                  <td className="px-3 py-3">{user.membershipCount}</td>
                  <td className="px-3 py-3">{t(`superadmin.users.commercial.${user.commercialStatus}`)}</td>
                  <td className="px-3 py-3">
                    <div>{formatDate(user.lastActiveAt)}</div>
                    <div className="text-text-tertiary text-xs">{user.lastActiveSurface ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{user.latestAppVersion ?? '—'}</div>
                    <div className="text-text-tertiary text-xs">{formatDate(user.mobileLastSeenAt)}</div>
                  </td>
                  <td className="px-3 py-3 text-text-secondary">{formatDate(user.createdAt)}</td>
                </tr>
              ))}
              {!query.isLoading && users.length === 0 ? (
                <tr>
                  <td className="text-text-secondary px-3 py-10 text-center" colSpan={7}>
                    {t('superadmin.users.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4">
          <span className="text-text-tertiary text-xs">{t('superadmin.users.total', { total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>
              <ChevronLeftIcon />
            </Button>
            <span className="text-sm">
              {page}
              {' '}
              /
              {totalPages}
            </span>
            <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </LinearBorderPanel>
    </div>
  )
}

function UserStatus({
  user,
}: {
  user: { banned: boolean, deletionRequestedAt: string | null, emailVerified: boolean }
}) {
  const { t } = useTranslation()
  const label = user.deletionRequestedAt
    ? t('superadmin.users.status.deleting')
    : user.banned
      ? t('superadmin.users.status.banned')
      : t('superadmin.users.status.active')
  return (
    <div>
      <span className="bg-fill/40 rounded px-2 py-1 text-xs font-medium">{label}</span>
      <div className="text-text-tertiary mt-1 text-xs">
        {user.emailVerified ? t('superadmin.users.verified') : t('superadmin.users.unverified')}
      </div>
    </div>
  )
}

function UserStats({ stats }: { stats?: SuperAdminUserStats }) {
  const { t } = useTranslation()
  const items = [
    ['total', stats?.totalUsers ?? 0],
    ['new-7d', stats?.newUsers7d ?? 0],
    ['active-7d', stats?.activeUsers7d ?? 0],
    ['active-30d', stats?.activeUsers30d ?? 0],
    ['dormant-90d', stats?.dormantUsers90d ?? 0],
    ['banned', stats?.bannedUsers ?? 0],
  ] as const
  return (
    <div className="grid gap-px overflow-hidden border border-border/40 bg-border/40 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([key, value]) => (
        <div key={key} className="bg-background-secondary px-4 py-3">
          <div className="text-text-tertiary text-xs">{t(`superadmin.users.stats.${key}`)}</div>
          <div className="text-text mt-1 text-2xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  )
}
