import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

import { SceneShell } from '../components/SceneShell'
import { intro } from '../copy'
import { color, font } from '../theme'

export function Intro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const chars = [...intro.line]
  const swap = Math.round(1.7 * fps)

  const lineOut = interpolate(frame, [swap - 10, swap + 8], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const logo = spring({ frame: frame - swap, fps, config: { damping: 16, mass: 0.9 } })
  const word = spring({ frame: frame - swap - 8, fps, config: { damping: 200 } })

  return (
    <SceneShell>
      <AbsoluteFill style={{ background: color.background, fontFamily: font, display: 'grid', placeItems: 'center' }}>
        <div
          style={{ position: 'absolute', display: 'flex', opacity: lineOut, filter: `blur(${(1 - lineOut) * 12}px)` }}
        >
          {chars.map((ch, i) => {
            const p = spring({ frame: frame - 6 - i * 2.2, fps, config: { damping: 200 } })
            return (
              <span
                key={`${i}-${ch}`}
                style={{
                  color: color.text,
                  fontSize: 84,
                  fontWeight: 700,
                  opacity: p,
                  filter: `blur(${(1 - p) * 14}px)`,
                  translate: `0 ${(1 - p) * 30}px`,
                }}
              >
                {ch}
              </span>
            )
          })}
        </div>
        <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: 36 }}>
          <Img
            src={staticFile('logo.jpg')}
            style={{
              width: 150,
              height: 150,
              borderRadius: 34,
              opacity: logo,
              scale: String(0.6 + 0.4 * logo),
              boxShadow: `0 0 0 1px ${color.hairline}, 0 24px 80px rgba(10,132,255,.25)`,
            }}
          />
          <span
            style={{
              color: color.text,
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: -1,
              opacity: word,
              translate: `${(1 - word) * -24}px 0`,
              filter: `blur(${(1 - word) * 10}px)`,
            }}
          >
            Afilmory
          </span>
        </div>
      </AbsoluteFill>
    </SceneShell>
  )
}
