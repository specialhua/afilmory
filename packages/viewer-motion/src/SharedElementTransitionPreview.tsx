import { animate, m, useMotionValue } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import type { ViewerTransition } from './types'

interface SharedElementTransitionPreviewProps {
  onComplete: () => void
  onReady?: () => void
  renderPlaceholder?: (thumbHash: string) => ReactNode
  transition: ViewerTransition
}

export const SharedElementTransitionPreview = ({
  transition,
  onReady,
  onComplete,
  renderPlaceholder,
}: SharedElementTransitionPreviewProps) => {
  const baseTransition = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  const entryHandoffLead = 0.1
  const entryFadeOutTransition = {
    duration: 0.1,
    ease: [0.32, 0.72, 0, 1] as const,
  }
  const thumbHash = typeof transition.thumbHash === 'string' ? transition.thumbHash : null
  const x = useMotionValue(transition.from.left)
  const y = useMotionValue(transition.from.top)
  const width = useMotionValue(transition.from.width)
  const height = useMotionValue(transition.from.height)
  const borderRadius = useMotionValue(transition.from.borderRadius)
  const rotate = useMotionValue(transition.from.rotate)
  const opacity = useMotionValue(1)
  const hasReadyRef = useRef(false)
  const hasCompletedRef = useRef(false)
  const transformOrigin =
    transition.variant === 'exit'
      ? (transition.from.transformOrigin ?? transition.to.transformOrigin ?? '50% 50%')
      : (transition.to.transformOrigin ?? transition.from.transformOrigin ?? '50% 50%')

  useEffect(() => {
    opacity.set(1)
    hasReadyRef.current = false
    hasCompletedRef.current = false
    let readyTimer: number | null = null

    const complete = () => {
      if (hasCompletedRef.current) return
      hasCompletedRef.current = true
      onComplete()
    }

    const ready = () => {
      if (hasReadyRef.current) return
      hasReadyRef.current = true

      if (transition.variant === 'entry') {
        onReady?.()
        const fadeAnimation = animate(opacity, 0, {
          ...entryFadeOutTransition,
          onComplete: complete,
        })
        animations.push(fadeAnimation)
        return
      }

      complete()
    }

    const animations = [
      animate(x, transition.to.left, baseTransition),
      animate(y, transition.to.top, baseTransition),
      animate(width, transition.to.width, {
        ...baseTransition,
        onComplete: ready,
      }),
      animate(height, transition.to.height, baseTransition),
      animate(borderRadius, transition.to.borderRadius, baseTransition),
      animate(rotate, transition.to.rotate, baseTransition),
    ]

    if (transition.variant === 'entry') {
      readyTimer = window.setTimeout(ready, Math.max(0, (baseTransition.duration - entryHandoffLead) * 1000))
    }

    return () => {
      if (readyTimer) {
        window.clearTimeout(readyTimer)
      }
      animations.forEach((animation) => animation.stop())
    }
  }, [
    borderRadius,
    height,
    onReady,
    onComplete,
    opacity,
    rotate,
    transition.to.borderRadius,
    transition.to.height,
    transition.to.left,
    transition.to.rotate,
    transition.to.top,
    transition.to.width,
    transition.variant,
    width,
    x,
    y,
  ])

  return (
    <m.div
      data-viewer-transition-variant={transition.variant}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 60,
        pointerEvents: 'none',
        x,
        y,
        width,
        height,
        borderRadius,
        opacity,
        rotate,
        transformOrigin,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: 'black',
        }}
      >
        {thumbHash && renderPlaceholder ? (
          <div style={{ position: 'absolute', inset: 0 }}>{renderPlaceholder(thumbHash)}</div>
        ) : null}
        <img
          src={transition.imageSrc}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>
    </m.div>
  )
}
