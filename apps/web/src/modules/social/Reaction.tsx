import { clsxm } from '@afilmory/utils'
import { FluentEmoji, getEmoji } from '@lobehub/fluent-emoji'
import { produce } from 'immer'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { tv } from 'tailwind-variants'

import { client } from '~/lib/client'

import { useAnalysis } from '../viewer/hooks/useAnalysis'

const reactions = ['👍', '😍', '🔥', '👏', '🌟', '🙌'] as const

interface ReactionRailProps {
  className?: string
  disabled?: boolean
  photoId: string
  style?: CSSProperties
}

const reactionRail = tv({
  slots: {
    root: 'pointer-events-auto absolute bottom-2 right-2 z-20 flex justify-center',
    track: [
      'flex flex-row items-center gap-2 px-2 py-1.5',
      'transition-all duration-200 ease-out',
      'opacity-0 translate-y-2 pointer-events-none',
      'data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0 data-[visible=true]:pointer-events-auto',
      'group-hover/photo-viewer:opacity-100 group-hover/photo-viewer:translate-y-0 group-hover/photo-viewer:pointer-events-auto',
    ],
    item: [
      'group/reaction-item relative flex size-11 items-center justify-center rounded-2xl',
      'bg-white/1 text-xl text-white/60 backdrop-blur-sm',
      'transition-all duration-300 ease-out',
      'hover:-translate-y-1 hover:scale-110 hover:bg-white/12 hover:text-white hover:backdrop-blur-lg',
      'active:scale-95',
      'data-[active=true]:bg-accent/18 data-[active=true]:text-accent data-[active=true]:backdrop-blur-xl',
      'disabled:pointer-events-none disabled:opacity-40',
    ],
    count:
      'absolute -right-1 -top-0.5 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-md',
  },
})

export const ReactionRail = ({ className, disabled = false, photoId, style }: ReactionRailProps) => {
  const styles = reactionRail()
  const { t } = useTranslation()
  const { data, mutate } = useAnalysis(photoId)
  const [activeReactions, setActiveReactions] = useState<Set<(typeof reactions)[number]>>(() => new Set())
  const activeReactionsRef = useRef(activeReactions)

  useEffect(() => {
    activeReactionsRef.current = activeReactions
  }, [activeReactions])

  const applyDelta = useCallback(
    (reaction: (typeof reactions)[number], delta: number) => {
      mutate(
        (current) => {
          if (!current) {
            return current
          }

          return produce(current, (draft) => {
            const next = Math.max(0, (draft.data.reactions[reaction] || 0) + delta)
            if (next === 0) {
              delete draft.data.reactions[reaction]
              return
            }
            draft.data.reactions[reaction] = next
          })
        },
        { revalidate: false },
      )
    },
    [mutate],
  )

  const sendReaction = useCallback(
    async (reaction: (typeof reactions)[number]) => {
      try {
        await client.actReaction({
          count: 1,
          refKey: photoId,
          reaction,
        })
        toast.success(t('photo.reaction.success'))
      }
      catch (error) {
        console.error('Failed to send reaction', error)
        toast.error('Failed to send reaction')
        applyDelta(reaction, -1)
        setActiveReactions((prev) => {
          const next = new Set(prev)
          next.delete(reaction)
          return next
        })
      }
    },
    [applyDelta, photoId, t],
  )

  const toggleReaction = useCallback(
    (reaction: (typeof reactions)[number]) => {
      const isActive = activeReactionsRef.current.has(reaction)
      const delta = isActive ? -1 : 1

      setActiveReactions((prev) => {
        const next = new Set(prev)
        if (isActive) {
          next.delete(reaction)
        }
        else {
          next.add(reaction)
        }
        return next
      })

      applyDelta(reaction, delta)

      if (!isActive) {
        void sendReaction(reaction)
      }
    },
    [applyDelta, sendReaction],
  )

  return (
    <div className={clsxm(styles.root(), className)} style={style}>
      <div className="group/rail relative flex w-full justify-center">
        <div className={styles.track()}>
          {reactions.map((reaction) => {
            const count = data?.data.reactions[reaction]
            const isActive = activeReactions.has(reaction)

            return (
              <button
                key={reaction}
                type="button"
                className={styles.item()}
                data-active={isActive}
                disabled={disabled}
                onClick={() => toggleReaction(reaction)}
                aria-pressed={isActive}
                aria-label={`React with ${reaction}`}
              >
                <FluentEmoji cdn="aliyun" emoji={getEmoji(reaction)!} size={24} type="anim" />
                {typeof count === 'number' && count > 0 && <span className={styles.count()}>{count}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
