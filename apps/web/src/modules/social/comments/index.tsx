import { ScrollArea } from '@afilmory/ui'
import { useAtom, useAtomValue } from 'jotai'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { sessionUserAtom } from '~/atoms/session'
import { injectConfig, siteConfig } from '~/config'

import { CommentItem } from './CommentCard'
import { CommentInput } from './CommentInput'
import { CommentsProvider, useCommentsContext } from './context'
import { EmptyState } from './EmptyState'
import { ErrorBox } from './ErrorBox'
import { SignInPanel } from './SignInPanel'
import { SkeletonList } from './SkeletonList'
import { WalineCommentsPanel } from './WalineCommentsPanel'

export const CommentsPanel: FC<{ photoId: string; visible?: boolean }> = ({ photoId }) => {
  if (siteConfig.comments?.provider === 'waline') {
    return <WalineCommentsPanel photoId={photoId} />
  }

  if (!injectConfig.useCloud) {
    return null
  }

  return (
    <CommentsProvider photoId={photoId}>
      <CommentsContent />
    </CommentsProvider>
  )
}

const CommentsContent: FC = () => {
  const { t, i18n } = useTranslation()

  const { atoms, methods } = useCommentsContext()
  const comments = useAtomValue(atoms.commentsAtom)

  const [status] = useAtom(atoms.statusAtom)
  const lastSubmittedCommentId = useAtomValue(atoms.lastSubmittedCommentIdAtom)

  const sessionUser = useAtomValue(sessionUserAtom)
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <ScrollArea mask rootClassName="flex-1 min-h-0" viewportClassName="px-4">
        <div className="space-y-4 pb-4">
          {status.isLoading && !status.isLoadingMore && !status.isError && comments.length === 0 ? (
            <SkeletonList />
          ) : status.isError ? (
            <ErrorBox />
          ) : comments.length === 0 ? (
            <EmptyState />
          ) : (
            comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                reacted={comment.viewerReactions.includes('like')}
                isNew={comment.id === lastSubmittedCommentId}
                locale={i18n.language || 'en'}
              />
            ))
          )}

          {status.nextCursor && (
            <button
              type="button"
              onClick={() => methods.loadMore()}
              disabled={status.isLoadingMore}
              className="glassmorphic-btn border-accent/30 hover:border-accent/60 mx-auto flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm text-white/80 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className="i-mingcute-arrow-down-line" />
              {status.isLoadingMore ? t('comments.loading') : t('comments.loadMore')}
            </button>
          )}
        </div>
      </ScrollArea>

      {sessionUser ? <CommentInput /> : <SignInPanel />}
    </div>
  )
}
