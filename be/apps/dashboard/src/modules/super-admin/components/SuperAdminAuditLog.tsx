import { Button } from '@afilmory/ui'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import { useSuperAdminAuditLogsQuery } from '../hooks'
import type { SuperAdminAuditLog as AuditLogEntry } from '../types'

export function SuperAdminAuditLog() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)
  const query = useSuperAdminAuditLogsQuery(page)
  const logs = query.data?.logs ?? []
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50))

  return (
    <LinearBorderPanel className="bg-background-secondary overflow-x-auto p-6">
      {query.isError ? <p className="mb-4 text-sm text-red">{t('superadmin.audit.error')}</p> : null}
      <table className="min-w-full divide-y divide-border/40 text-sm">
        <thead>
          <tr className="text-text-tertiary text-left text-xs uppercase">
            <th className="px-3 py-2">{t('superadmin.audit.time')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.actor')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.action')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.target')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.result')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.batch')}</th>
            <th className="px-3 py-2">{t('superadmin.audit.details')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {logs.map(log => (
            <tr key={log.id}>
              <td className="px-3 py-3">{new Date(log.occurredAt).toLocaleString()}</td>
              <td className="px-3 py-3 font-mono text-xs">{log.actorUserId ?? 'system'}</td>
              <td className="px-3 py-3 font-medium">{log.action}</td>
              <td className="px-3 py-3">
                <div>{log.targetType}</div>
                <div className="text-text-tertiary font-mono text-xs">{log.targetId}</div>
              </td>
              <td className="px-3 py-3">
                {log.result}
                {log.errorCode ? ` (${log.errorCode})` : ''}
              </td>
              <td className="px-3 py-3 font-mono text-xs">{log.batchId ?? '—'}</td>
              <td className="px-3 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(current => (current?.id === log.id ? null : log))}
                >
                  {selected?.id === log.id ? t('superadmin.audit.hide-details') : t('superadmin.audit.view-details')}
                </Button>
              </td>
            </tr>
          ))}
          {!query.isLoading && logs.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-text-secondary px-3 py-10 text-center">
                {t('superadmin.audit.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {selected ? <AuditDetail log={selected} /> : null}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/40 pt-4">
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>
          <ChevronLeftIcon />
        </Button>
        <span className="text-sm">
          {page}
          {' '}
          /
          {totalPages}
        </span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
    </LinearBorderPanel>
  )
}

function AuditDetail({ log }: { log: AuditLogEntry }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 space-y-3 border border-border/40 bg-background p-4">
      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <AuditField label={t('superadmin.audit.request-id')} value={log.requestId ?? '—'} />
        <AuditField label={t('superadmin.audit.error-code')} value={log.errorCode ?? '—'} />
        <AuditField label={t('superadmin.audit.batch')} value={log.batchId ?? '—'} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <AuditSnapshot label={t('superadmin.audit.before')} value={log.before} />
        <AuditSnapshot label={t('superadmin.audit.after')} value={log.after} />
      </div>
    </div>
  )
}

function AuditField({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <div className="text-text-tertiary">{label}</div>
      <div className="mt-1 break-all font-mono text-text">{value}</div>
    </div>
  )
}

function AuditSnapshot({ label, value }: { label: string, value: Record<string, unknown> | null }) {
  return (
    <div>
      <div className="text-text-tertiary mb-1 text-xs font-medium">{label}</div>
      <pre className="max-h-72 overflow-auto border border-border/30 bg-background-secondary p-3 text-xs">
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  )
}
