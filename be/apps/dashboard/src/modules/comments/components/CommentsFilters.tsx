import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@afilmory/ui'
import { X } from 'lucide-react'
import { memo, useCallback } from 'react'

import { LinearBorderPanel } from '~/components/common/LinearBorderPanel'

import type { CommentStatus } from '../types'

interface CommentsFiltersProps {
  photoIdFilter: string
  statusFilter: CommentStatus | 'all'
  onPhotoIdChange: (value: string) => void
  onStatusChange: (value: CommentStatus | 'all') => void
  onClearAll: () => void
}

export const CommentsFilters = memo(
  ({ photoIdFilter, statusFilter, onPhotoIdChange, onStatusChange, onClearAll }: CommentsFiltersProps) => {
    const handlePhotoIdChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onPhotoIdChange(e.target.value)
      },
      [onPhotoIdChange],
    )

    const handleStatusChange = useCallback(
      (value: string) => {
        onStatusChange(value as CommentStatus | 'all')
      },
      [onStatusChange],
    )

    const handleClearPhotoId = useCallback(() => {
      onPhotoIdChange('')
    }, [onPhotoIdChange])

    const hasActiveFilters = photoIdFilter || statusFilter !== 'all'

    return (
      <LinearBorderPanel className="bg-background-tertiary">
        <div className="p-5">
          <h3 className="mb-4 text-sm font-medium text-text">筛选条件</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Photo ID Filter */}
            <div className="space-y-2">
              <label htmlFor="photoId" className="block text-sm text-text">
                照片 ID
              </label>
              <Input
                type="text"
                id="photoId"
                value={photoIdFilter}
                onChange={handlePhotoIdChange}
                placeholder="输入照片 ID"
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <label htmlFor="status" className="block text-sm font-medium text-text">
                状态
              </label>
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="approved">已批准</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="hidden">已隐藏</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-secondary">当前筛选:</span>
              {photoIdFilter && <FilterTag label={`照片: ${photoIdFilter}`} onClear={handleClearPhotoId} />}
              {statusFilter !== 'all' && (
                <FilterTag label={`状态: ${getStatusLabel(statusFilter)}`} onClear={() => onStatusChange('all')} />
              )}
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-text-tertiary transition-colors hover:text-text"
              >
                清除全部
              </button>
            </div>
          )}
        </div>
      </LinearBorderPanel>
    )
  },
)

const FilterTag = memo(({ label, onClear }: { label: string, onClear: () => void }) => {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 inline-flex items-center justify-center transition-colors hover:text-accent/80"
      >
        <X className="size-3" />
      </button>
    </span>
  )
})

function getStatusLabel(status: CommentStatus): string {
  const labels: Record<CommentStatus, string> = {
    approved: '已批准',
    pending: '待审核',
    hidden: '已隐藏',
    rejected: '已拒绝',
  }
  return labels[status]
}
