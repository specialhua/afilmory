import { spring, useCurrentFrame, useVideoConfig } from 'remotion'

import { color, font } from '../theme'

export function Caption({ eyebrow, text }: { eyebrow: string, text: string }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rise = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 } })
  const a = rise(8)
  const b = rise(14)

  return (
    <div style={{ position: 'absolute', top: 44, left: 0, right: 0, textAlign: 'center', fontFamily: font }}>
      <div
        style={{
          color: color.accent,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 2,
          opacity: a,
          translate: `0 ${(1 - a) * 16}px`,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          marginTop: 10,
          color: color.text,
          fontSize: 54,
          fontWeight: 700,
          letterSpacing: 1,
          opacity: b,
          translate: `0 ${(1 - b) * 24}px`,
          filter: `blur(${(1 - b) * 10}px)`,
        }}
      >
        {text}
      </div>
    </div>
  )
}
