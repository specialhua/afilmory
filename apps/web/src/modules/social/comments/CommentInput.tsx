import { clsxm as cn } from '@afilmory/utils'
import { useAtom, useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { AlertCircle, Reply, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { sessionUserAtom } from '~/atoms/session'
import { useMobile } from '~/hooks/useMobile'

import { useCommentsContext } from './context'
import { UserAvatar } from './UserAvatar'

export const CommentInput = () => {
  const { t } = useTranslation()
  const { atoms, methods } = useCommentsContext()
  const [newComment, setNewComment] = useAtom(atoms.newCommentAtom)
  const sessionUser = useAtomValue(sessionUserAtom)
  const submitError = useAtomValue(atoms.submitErrorAtom)
  const status = useAtomValue(atoms.statusAtom)

  const [replyTo, setReplyTo] = useAtom(atoms.replyToAtom)
  const isMobile = useMobile()

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNewComment(e.target.value)
      if (submitError) {
        methods.clearSubmitError()
      }
    },
    [setNewComment, submitError, methods],
  )

  const replyUserName = useAtomValue(
    useMemo(
      () => selectAtom(atoms.usersAtom, users => (replyTo?.userId ? users[replyTo.userId]?.name : null)),
      [atoms.usersAtom, replyTo?.userId],
    ),
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    methods.submit(newComment)
  }

  return (
    <div className="border-accent/10 shrink-0 border-t p-4">
      {submitError && (
        <div className="animate-shake mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="size-3 shrink-0" />
          <span>{t(submitError.message as any)}</span>
          <button
            type="button"
            className="ml-auto text-red-400/60 transition hover:text-red-400"
            onClick={() => methods.clearSubmitError()}
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {replyTo && !submitError ? (
        <div className="border-accent/20 bg-accent/50 mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-white/80 select-none">
          <div className="flex items-center gap-2">
            <Reply className="size-3 opacity-50" />
            <span>
              <Trans
                i18nKey="comments.replyingTo"
                components={{ strong: <b className="font-medium" /> }}
                values={{ user: replyUserName }}
              />
            </span>
          </div>
          <button type="button" className="text-white/50 transition hover:text-white" onClick={() => setReplyTo(null)}>
            <X className="size-3" />
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <UserAvatar image={sessionUser?.image} name={sessionUser?.name || sessionUser?.id} fallback="G" size={36} />

        <div className="flex-1">
          <textarea
            name="comment"
            autoComplete="off"
            value={newComment}
            onChange={handleInputChange}
            placeholder={t('comments.placeholder')}
            rows={isMobile ? 2 : 1}
            disabled={status.isLoading}
            className={cn(
              'bg-material-medium w-full resize-none rounded-lg border px-3 py-2 text-sm text-white transition-colors placeholder:text-white/40 focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
              submitError
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50'
                : 'focus:ring-accent/50 focus:border-accent/50 border-transparent',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!newComment.trim() || status.isLoading}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40',
            status.isLoading ? 'bg-accent/50' : 'bg-accent shadow-accent/20',
          )}
        >
          {status.isLoading ? (
            <i className="i-mingcute-loading-line animate-spin" />
          ) : (
            <i className="i-mingcute-send-line" />
          )}
        </button>
      </form>
    </div>
  )
}
