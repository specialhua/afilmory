import type { ReactNode } from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

import { TRANSITION_FRAMES } from '../copy'

export function SceneShell({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const ease = {
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  } as const

  const enter = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], ease)
  const exit = interpolate(frame, [durationInFrames - TRANSITION_FRAMES, durationInFrames], [1, 0], ease)
  const t = Math.min(enter, exit)

  return (
    <AbsoluteFill
      style={{
        opacity: t,
        filter: `blur(${(1 - t) * 18}px)`,
        scale: String(frame < TRANSITION_FRAMES ? 1.04 - 0.04 * enter : 1 - 0.03 * (1 - exit)),
      }}
    >
      {children}
    </AbsoluteFill>
  )
}
