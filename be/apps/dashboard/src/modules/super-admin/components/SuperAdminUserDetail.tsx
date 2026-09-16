import { Button, Prompt } from '@afilmory/ui'
import { ArrowLeftIcon, BanIcon, LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

import {
  useRevokeSuperAdminUserSessionsMutation,
  useSuperAdminUserQuery,
  useUpdateSuperAdminUserBanMutation,
} from '../hooks'

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string | null | undefined) => (value ? DATE_FORMATTER.format(new Date(value)) : '—')

export function SuperAdminUserDetail({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const query = useSuperAdminUserQuery(userId)
  const banMutation = useUpdateSuperAdminUserBanMutation()
  const revokeMutation = useRevokeSuperAdminUserSessionsMutation()
  const data = query.data

  if (query.isLoading) {
    return <LinearBorderPanel className="p-8">{t('superadmin.users.loading')}</LinearBorderPanel>
  }
  if (!data) {
    return <LinearBorderPanel className="p-8 text-red">{t('superadmin.users.detail.error')}</LinearBorderPanel>
  }

  const handleBan = () => {
    if (data.user.banned) {
      Prompt.prompt({
        title: t('superadmin.users.actions.unban'),
        description: data.user.email,
        onConfirm: async () => {
          await banMutation.mutateAsync({ userId, banned: false })
          toast.success(t('superadmin.users.actions.updated'))
        },
      })
      return
    }
    Prompt.input({
      title: t('superadmin.users.actions.ban'),
      description: t('superadmin.users.actions.ban-description'),
      placeholder: t('superadmin.users.actions.ban-reason'),
      variant: 'danger',
      onConfirm: async (reason) => {
        await banMutation.mutateAsync({ userId, banned: true, reason: reason.trim() || null })
        toast.success(t('superadmin.users.actions.updated'))
      },
    })
  }

  const handleRevoke = () => {
    Prompt.prompt({
      title: t('superadmin.users.actions.revoke-sessions'),
      description: t('superadmin.users.actions.revoke-description'),
      variant: 'danger',
      onConfirm: async () => {
        const result = await revokeMutation.mutateAsync(userId)
        toast.success(t('superadmin.users.actions.revoked', { count: result.revokedSessions }))
      },
    })
  }

  return (
    <div className="space-y-5">
      <Link
        to="/superadmin/users"
        className="text-text-secondary inline-flex items-center gap-2 text-sm hover:text-text"
      >
        <ArrowLeftIcon className="size-4" />
        {t('superadmin.users.detail.back')}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-text text-2xl font-semibold">{data.user.name}</h1>
          <p className="text-text-secondary text-sm">
            {data.user.email}
            {' '}
            ·
            {data.user.id}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleRevoke} disabled={revokeMutation.isPending}>
            <LogOutIcon className="size-4" />
            {t('superadmin.users.actions.revoke-sessions')}
          </Button>
          <Button
            variant={data.user.banned ? 'secondary' : 'destructive'}
            onClick={handleBan}
            disabled={banMutation.isPending}
          >
            <BanIcon className="size-4" />
            {data.user.banned ? t('superadmin.users.actions.unban') : t('superadmin.users.actions.ban')}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          {DETAIL_TABS.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {t(tab.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Overview data={data} />
        </TabsContent>
        <TabsContent value="workspaces" className="mt-4">
          <Workspaces rows={data.memberships} />
        </TabsContent>
        <TabsContent value="authentication" className="mt-4">
          <Authentication data={data} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <Activity rows={data.activities} />
        </TabsContent>
        <TabsContent value="commercial" className="mt-4">
          <Commercial rows={data.subscriptions} />
        </TabsContent>
        <TabsContent value="mobile" className="mt-4">
          <Mobile data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Overview({ data }: { data: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']> }) {
  const { t } = useTranslation()
  const fields: Array<[string, string]> = [
    [t('superadmin.users.detail.fields.email-verified'), data.user.emailVerified ? t('common.yes') : t('common.no')],
    [
      t('superadmin.users.detail.fields.two-factor'),
      data.user.twoFactorEnabled ? t('common.enabled') : t('common.disabled'),
    ],
    [t('superadmin.users.detail.fields.platform-role'), data.user.role],
    [t('superadmin.users.detail.fields.registered'), formatDate(data.user.createdAt)],
    [t('superadmin.users.detail.fields.last-signed-in'), formatDate(data.user.lastSignedInAt)],
    [t('superadmin.users.detail.fields.last-active'), formatDate(data.user.lastActiveAt)],
    [t('superadmin.users.detail.fields.last-surface'), data.user.lastActiveSurface ?? '—'],
    [t('superadmin.users.detail.fields.deletion-requested'), formatDate(data.user.deletionRequestedAt)],
    [t('superadmin.users.detail.fields.comments'), String(data.social.comments)],
    [t('superadmin.users.detail.fields.gallery-subscriptions'), String(data.social.gallerySubscriptions)],
  ]
  return <DefinitionPanel fields={fields} />
}

const DETAIL_TABS = [
  { id: 'overview', label: 'superadmin.users.detail.tabs.overview' },
  { id: 'workspaces', label: 'superadmin.users.detail.tabs.workspaces' },
  { id: 'authentication', label: 'superadmin.users.detail.tabs.authentication' },
  { id: 'activity', label: 'superadmin.users.detail.tabs.activity' },
  { id: 'commercial', label: 'superadmin.users.detail.tabs.commercial' },
  { id: 'mobile', label: 'superadmin.users.detail.tabs.mobile' },
] as const

function Workspaces({ rows }: { rows: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']>['memberships'] }) {
  const { t } = useTranslation()
  return (
    <DataTable
      headers={[
        t('superadmin.users.detail.columns.workspace'),
        t('superadmin.users.detail.columns.role'),
        t('superadmin.users.detail.columns.status'),
        t('superadmin.users.detail.columns.plan'),
        t('superadmin.users.detail.columns.joined'),
      ]}
      rows={rows.map(row => ({
        cells: [
          <Link key={row.tenantId} to="/superadmin/tenants" className="text-primary hover:underline">
            {row.tenantName}
            {' '}
            (
            {row.tenantSlug}
            )
          </Link>,
          row.role,
          row.status,
          `${row.planId}${row.storagePlanId ? ` / ${row.storagePlanId}` : ''}`,
          formatDate(row.createdAt),
        ],
        key: row.id,
      }))}
    />
  )
}

function Authentication({ data }: { data: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']> }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <DefinitionPanel
        fields={data.accounts.map(account => [
          t('superadmin.users.detail.fields.provider', { provider: account.providerId }),
          formatDate(account.createdAt),
        ])}
      />
      <DataTable
        headers={[
          t('superadmin.users.detail.columns.session'),
          t('superadmin.users.detail.columns.active-workspace'),
          t('superadmin.users.detail.columns.ip'),
          t('superadmin.users.detail.columns.user-agent'),
          t('superadmin.users.detail.columns.created'),
          t('superadmin.users.detail.columns.expires'),
        ]}
        rows={data.sessions.map(session => ({
          cells: [
            session.id,
            session.activeTenantId ?? '—',
            session.ipAddress ?? '—',
            session.userAgent ?? '—',
            formatDate(session.createdAt),
            formatDate(session.expiresAt),
          ],
          key: session.id,
        }))}
      />
    </div>
  )
}

function Activity({ rows }: { rows: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']>['activities'] }) {
  const { t } = useTranslation()
  return (
    <DataTable
      headers={[
        t('superadmin.users.detail.columns.event'),
        t('superadmin.users.detail.columns.surface'),
        t('superadmin.users.detail.columns.workspace'),
        t('superadmin.users.detail.columns.app-version'),
        t('superadmin.users.detail.columns.occurred'),
      ]}
      rows={rows.map(row => ({
        cells: [row.eventType, row.surface, row.tenantId ?? '—', row.appVersion ?? '—', formatDate(row.occurredAt)],
        key: row.id,
      }))}
    />
  )
}

function Commercial({
  rows,
}: {
  rows: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']>['subscriptions']
}) {
  const { t } = useTranslation()
  return (
    <DataTable
      headers={[
        t('superadmin.users.detail.columns.workspace'),
        t('superadmin.users.detail.columns.plan'),
        t('superadmin.users.detail.columns.subscription'),
        t('superadmin.users.detail.columns.product'),
        t('superadmin.users.detail.columns.period-end'),
        t('superadmin.users.detail.columns.cancel-at-end'),
      ]}
      rows={rows.map(row => ({
        cells: [
          `${row.tenantName} (${row.tenantSlug})`,
          row.planId,
          row.status ?? '—',
          row.productId ?? '—',
          formatDate(row.periodEnd),
          row.cancelAtPeriodEnd ? t('common.yes') : t('common.no'),
        ],
        key: `${row.tenantId}-${row.subscriptionId ?? 'no-subscription'}`,
      }))}
    />
  )
}

function Mobile({ data }: { data: NonNullable<ReturnType<typeof useSuperAdminUserQuery>['data']> }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <DefinitionPanel
        fields={[
          [t('superadmin.users.detail.fields.mobile-last-seen'), formatDate(data.mobileSummary.lastSeenAt)],
          [t('superadmin.users.detail.fields.mobile-version'), data.mobileSummary.latestAppVersion ?? '—'],
          [t('superadmin.users.detail.fields.mobile-activities'), String(data.mobileSummary.activityCount)],
          [t('superadmin.users.detail.fields.push-devices'), String(data.mobileSummary.deviceCount)],
        ]}
      />
      <DataTable
        headers={[
          t('superadmin.users.detail.columns.environment'),
          t('superadmin.users.detail.columns.app-version'),
          t('superadmin.users.detail.columns.locale'),
          t('superadmin.users.detail.columns.push'),
          t('superadmin.users.detail.columns.last-seen'),
        ]}
        rows={data.devices.map(row => ({
          cells: [
            row.environment,
            row.appVersion ?? '—',
            row.locale ?? '—',
            row.enabled ? t('common.enabled') : t('common.disabled'),
            formatDate(row.lastSeenAt),
          ],
          key: row.id,
        }))}
      />
    </div>
  )
}

function DefinitionPanel({ fields }: { fields: Array<[string, string]> }) {
  return (
    <LinearBorderPanel className="bg-background-secondary p-5">
      <dl className="grid gap-px overflow-hidden border border-border/40 bg-border/40 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-background px-4 py-3">
            <dt className="text-text-tertiary text-xs">{label}</dt>
            <dd className="text-text mt-1 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </LinearBorderPanel>
  )
}

function DataTable({ headers, rows }: { headers: string[], rows: Array<{ cells: React.ReactNode[], key: string }> }) {
  return (
    <LinearBorderPanel className="bg-background-secondary overflow-x-auto p-5">
      <table className="min-w-full divide-y divide-border/40 text-sm">
        <thead>
          <tr>
            {headers.map(header => (
              <th key={header} className="text-text-tertiary px-3 py-2 text-left text-xs uppercase">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {rows.map(row => (
            <tr key={row.key}>
              {row.cells.map((cell, cellIndex) => (
                <td key={`${row.key}-${headers[cellIndex]}`} className="max-w-80 px-3 py-3 align-top break-words">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="text-text-secondary px-3 py-10 text-center">
                No data
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </LinearBorderPanel>
  )
}
