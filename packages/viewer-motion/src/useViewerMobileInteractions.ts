import { useDrag } from '@use-gesture/react'
import { animate, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  clamp,
  createDismissPresentationSnapshot,
  easeOutCubic,
  easeOutQuad,
  resolveMobileViewerInteractionMetrics,
} from './mobile-interaction-utils'
import { ViewerSpring } from './spring'
import type { UseViewerMobileInteractionsOptions } from './types'
import { useWindowViewport } from './useWindowViewport'

interface GestureMemoState {
  ignore: boolean
  inspectorPixels: number
  startedWithInspectorOpen: boolean
}

export const useViewerMobileInteractions = ({
  enabled,
  isImageZoomed,
  onDismiss,
  viewport,
}: UseViewerMobileInteractionsOptions) => {
  const windowViewport = useWindowViewport()
  const viewportWidth = viewport?.width || windowViewport.width || 390
  const viewportHeight = viewport?.height || windowViewport.height || 844

  const { dismissThreshold, dismissTravel, inspectorRevealDistance } = useMemo(
    () => resolveMobileViewerInteractionMetrics(viewportHeight),
    [viewportHeight],
  )

  const inspectorProgress = useMotionValue(0)
  const dismissX = useMotionValue(0)
  const dismissY = useMotionValue(0)
  const [isInspectorVisible, setIsInspectorVisible] = useState(false)
  const [isVerticalGestureActive, setIsVerticalGestureActive] = useState(false)

  const animationControlsRef = useRef<ReturnType<typeof animate>[]>([])
  const isClosingRef = useRef(false)

  const registerAnimation = useCallback((animation: ReturnType<typeof animate>) => {
    animationControlsRef.current.push(animation)
    return animation
  }, [])

  const stopAnimations = useCallback(() => {
    animationControlsRef.current.forEach((animation) => animation.stop())
    animationControlsRef.current = []
  }, [])

  const reset = useCallback(() => {
    stopAnimations()
    isClosingRef.current = false
    setIsInspectorVisible(false)
    setIsVerticalGestureActive(false)
    inspectorProgress.set(0)
    dismissX.set(0)
    dismissY.set(0)
  }, [dismissX, dismissY, inspectorProgress, stopAnimations])

  useEffect(() => {
    const unsubscribe = inspectorProgress.on('change', (latest) => {
      setIsInspectorVisible(clamp(latest, 0, 1) > 0.02)
    })

    return () => {
      unsubscribe()
    }
  }, [inspectorProgress])

  useEffect(() => {
    if (!enabled) {
      reset()
    }
  }, [enabled, reset])

  const springValue = useCallback(
    (value: typeof inspectorProgress | typeof dismissX | typeof dismissY, to: number, velocity = 0) => {
      return registerAnimation(
        animate(value, to, {
          ...ViewerSpring.presets.smooth,
          velocity,
        }),
      )
    },
    [registerAnimation],
  )

  const getDismissPresentationSnapshot = useCallback(
    (translateX = dismissX.get(), translateY = dismissY.get()) =>
      createDismissPresentationSnapshot({
        translateX,
        translateY,
        dismissTravel,
        viewportWidth,
      }),
    [dismissTravel, dismissX, dismissY, viewportWidth],
  )

  const settleInspector = useCallback(
    (open: boolean, velocity = 0) => {
      stopAnimations()
      if (isClosingRef.current) return
      const clampedVelocity = clamp(velocity, -2.2, 2.2)
      const settleVelocity = open ? Math.max(clampedVelocity, 0) : Math.min(clampedVelocity, 0)

      registerAnimation(
        animate(inspectorProgress, open ? 1 : 0, {
          ...ViewerSpring.smooth(open ? 0.32 : 0.28),
          velocity: settleVelocity,
        }),
      )
      registerAnimation(animate(dismissX, 0, ViewerSpring.smooth(0.26)))
      registerAnimation(animate(dismissY, 0, ViewerSpring.smooth(open ? 0.28 : 0.24)))
    },
    [dismissX, dismissY, inspectorProgress, registerAnimation, stopAnimations],
  )

  const dismissWithThrow = useCallback(
    (velocityX: number, velocityY: number) => {
      if (isClosingRef.current) return

      isClosingRef.current = true
      setIsInspectorVisible(false)
      setIsVerticalGestureActive(false)
      stopAnimations()
      inspectorProgress.set(0)

      const clampedVelocityX = clamp(velocityX, -2.2, 2.2)
      const clampedVelocityY = clamp(velocityY, 0.72, 2.8)
      const currentX = dismissX.get()
      const currentY = dismissY.get()
      const throwDistanceY = clamp(viewportHeight * (0.06 + clampedVelocityY * 0.045), 56, 168)
      const throwDistanceX = clamp(clampedVelocityX * viewportWidth * 0.12, -viewportWidth * 0.16, viewportWidth * 0.16)
      const targetX = clamp(currentX + throwDistanceX, -viewportWidth * 0.28, viewportWidth * 0.28)
      const targetY = clamp(currentY + throwDistanceY, currentY + 40, viewportHeight * 0.42)

      registerAnimation(
        animate(dismissX, targetX, {
          ...ViewerSpring.snappy(0.18, 0.06),
          velocity: clampedVelocityX * viewportWidth * 0.14,
        }),
      )

      registerAnimation(
        animate(dismissY, targetY, {
          ...ViewerSpring.snappy(0.18, 0.04),
          velocity: Math.max(clampedVelocityY * viewportHeight * 0.08, 160),
          onComplete: () => {
            onDismiss(getDismissPresentationSnapshot(targetX, targetY))
          },
        }),
      )
    },
    [
      dismissX,
      dismissY,
      getDismissPresentationSnapshot,
      inspectorProgress,
      onDismiss,
      registerAnimation,
      stopAnimations,
      viewportHeight,
      viewportWidth,
    ],
  )

  const openInspector = useCallback(() => {
    settleInspector(true)
  }, [settleInspector])

  const closeInspector = useCallback(() => {
    settleInspector(false)
  }, [settleInspector])

  const toggleInspector = useCallback(() => {
    settleInspector(inspectorProgress.get() <= 0.5)
  }, [inspectorProgress, settleInspector])

  const bindStage = useDrag(
    ({ active, axis, event, first, last, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], memo }) => {
      if (!enabled || isImageZoomed || isClosingRef.current) {
        if (last) {
          setIsVerticalGestureActive(false)
        }
        return memo
      }

      const start: GestureMemoState = memo ?? {
        inspectorPixels: inspectorProgress.get() * inspectorRevealDistance,
        startedWithInspectorOpen: inspectorProgress.get() > 0.02,
        ignore: false,
      }

      if (first && event.target instanceof HTMLElement) {
        const isInteractiveTarget = Boolean(
          event.target.closest('button, a, [role="button"], [data-viewer-interactive]'),
        )

        if (isInteractiveTarget) {
          return {
            ...start,
            ignore: true,
          }
        }
      }

      if (start.ignore) {
        if (last) {
          setIsVerticalGestureActive(false)
        }
        return start
      }

      if (axis && axis !== 'y') {
        if (last) {
          setIsVerticalGestureActive(false)
        }
        return start
      }

      if (active) {
        stopAnimations()
        setIsVerticalGestureActive(true)

        const nextInspectorPixels = start.inspectorPixels - my
        const startedWithInspectorOpen = start.startedWithInspectorOpen || start.inspectorPixels > 0

        if (startedWithInspectorOpen) {
          inspectorProgress.set(clamp(nextInspectorPixels / inspectorRevealDistance, 0, 1))
          dismissX.set(0)
          dismissY.set(0)
        } else if (nextInspectorPixels > 0) {
          inspectorProgress.set(clamp(nextInspectorPixels / inspectorRevealDistance, 0, 1))
          dismissX.set(0)
          dismissY.set(0)
        } else {
          const nextDismissY = clamp(-nextInspectorPixels, 0, dismissTravel)
          const dismissRatio = nextDismissY / Math.max(dismissTravel, 1)

          inspectorProgress.set(0)
          dismissY.set(nextDismissY)
          dismissX.set(clamp(mx * (0.18 + dismissRatio * 0.12), -viewportWidth * 0.24, viewportWidth * 0.24))
        }
      }

      if (last) {
        setIsVerticalGestureActive(false)
        const startedWithInspectorOpen =
          start.startedWithInspectorOpen || start.inspectorPixels > 0 || inspectorProgress.get() > 0.02
        const inspectorReleaseVelocity = -dy * vy

        if (startedWithInspectorOpen) {
          springValue(dismissX, 0)
          springValue(dismissY, 0)

          const currentProgress = inspectorProgress.get()
          const shouldOpen = currentProgress > 0.42 || (dy < 0 && vy > 0.2)
          settleInspector(shouldOpen, inspectorReleaseVelocity)
          return start
        }

        const dismissDistance = dismissY.get()

        if (dismissDistance > dismissThreshold || (dy > 0 && vy > 0.65 && my > 36)) {
          dismissWithThrow(vx * (dx === 0 ? 1 : dx), Math.max(vy, 0.72))
          return start
        }

        springValue(dismissX, 0)
        springValue(dismissY, 0)

        const currentProgress = inspectorProgress.get()
        const shouldOpen = currentProgress > 0.42 || (dy < 0 && vy > 0.2)
        settleInspector(shouldOpen, inspectorReleaseVelocity)
      }

      return start
    },
    {
      axis: 'lock',
      filterTaps: true,
      threshold: 10,
      pointer: { touch: true, capture: false },
      rubberband: 0.12,
    },
  )

  const dismissProgress = useTransform(dismissY, [0, dismissTravel], [0, 1])
  const inspectorClampedProgress = useTransform(() => clamp(inspectorProgress.get(), 0, 1))
  const inspectorVisualProgress = useTransform(() => easeOutCubic(inspectorClampedProgress.get()))
  const dismissVisualProgress = useTransform(() => easeOutQuad(dismissProgress.get()))
  const viewerScale = useTransform(() =>
    clamp(1 - inspectorVisualProgress.get() * 0.022 - dismissVisualProgress.get() * 0.13, 0.8, 1),
  )
  const viewerRotate = useTransform(
    () => (dismissX.get() / Math.max(viewportWidth, 1)) * (4.5 + dismissVisualProgress.get() * 2.5),
  )
  const viewerLiftY = useTransform(
    () => dismissY.get() - inspectorVisualProgress.get() * 18 - dismissVisualProgress.get() * 8,
  )
  const viewerBorderRadius = useTransform(() => inspectorVisualProgress.get() * 14 + dismissVisualProgress.get() * 22)
  const backdropOpacity = useTransform(() =>
    clamp(1 - dismissVisualProgress.get() * 0.84 - inspectorVisualProgress.get() * 0.08, 0.08, 1),
  )
  const chromeOpacity = useTransform(() =>
    clamp(1 - inspectorVisualProgress.get() * 0.92 - dismissVisualProgress.get() * 0.52, 0, 1),
  )
  const chromeY = useTransform(
    () => dismissY.get() * 0.08 - inspectorVisualProgress.get() * 12 - dismissVisualProgress.get() * 6,
  )
  const thumbnailsOpacity = useTransform(() =>
    clamp(1 - inspectorVisualProgress.get() * 1.05 - dismissVisualProgress.get() * 0.58, 0, 1),
  )
  const thumbnailsY = useTransform(() => inspectorVisualProgress.get() * 18 + dismissVisualProgress.get() * 10)
  const stageHintOpacity = useTransform(() =>
    clamp(0.42 - inspectorVisualProgress.get() * 0.66 - dismissVisualProgress.get() * 0.54, 0, 0.42),
  )
  const stageHintY = useTransform(() => inspectorVisualProgress.get() * 10 + dismissVisualProgress.get() * 12)

  return {
    backdropOpacity,
    bindStage,
    chromeOpacity,
    chromeY,
    closeInspector,
    dismissX,
    dismissY,
    inspectorProgress: inspectorClampedProgress,
    isInspectorVisible,
    isVerticalGestureActive,
    openInspector,
    reset,
    settleInspector,
    stageHintOpacity,
    stageHintY,
    thumbnailsOpacity,
    thumbnailsY,
    toggleInspector,
    viewerBorderRadius,
    viewerLiftY,
    viewerRotate,
    viewerScale,
  }
}
