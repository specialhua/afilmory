import { useAtomValue } from 'jotai'
import { selectAtom } from 'jotai/utils'
import { Reply } from 'lucide-react'
import { useMemo } from 'react'
import { Trans } from 'react-i18next'

import type { Comment } from '~/lib/api/comments'
import { autolink } from '~/lib/autolink'

import { useCommentsContext } from './context'

interface CommentContentProps {
  comment: Comment
  parentId: string | null
  authorName: (comment: Comment) => string
}

export const CommentContent = ({ comment, parentId, authorName }: CommentContentProps) => {
  const { atoms } = useCommentsContext()
  const parent = useAtomValue(
    useMemo(
      () => selectAtom(atoms.relationsAtom, relations => (parentId ? relations[parentId] : null)),
      [atoms.relationsAtom, parentId],
    ),
  )
  return (
    <>
      {parent ? (
        <div className="flex min-w-0 flex-col rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-white/70">
          <div className="mb-1 flex items-center text-[11px] tracking-wide text-white/40 uppercase">
            <Reply className="mr-2 size-3" />

            <Trans
              i18nKey="comments.replyingTo"
              components={{ strong: <b className="ml-1 font-medium" /> }}
              values={{ user: authorName(parent) }}
            />
          </div>
          <p className="line-clamp-3 text-sm leading-relaxed wrap-break-word text-white/70">
            {autolink(parent.content)}
          </p>
        </div>
      ) : null}

      <p className="text-sm leading-relaxed wrap-break-word text-white/85">{autolink(comment.content)}</p>
    </>
  )
}
