import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

import { SceneShell } from '../components/SceneShell'
import { outro } from '../copy'
import { color, font } from '../theme'

export function Outro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rise = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 200 } })
  const [logo, title, tagline, repo] = [rise(6), rise(14), rise(24), rise(34)]
  const lift = (p: number) => ({ opacity: p, translate: `0 ${(1 - p) * 24}px`, filter: `blur(${(1 - p) * 10}px)` })

  return (
    <SceneShell>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 50% 45% at 50% 42%, rgba(10,132,255,.22), transparent 70%), ${color.background}`,
          fontFamily: font,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Img
          src={staticFile('logo.jpg')}
          style={{ width: 170, height: 170, borderRadius: 38, boxShadow: `0 0 0 1px ${color.hairline}`, ...lift(logo) }}
        />
        <div
          style={{ marginTop: 40, color: color.text, fontSize: 96, fontWeight: 700, letterSpacing: -1, ...lift(title) }}
        >
          {outro.title}
        </div>
        <div
          style={{
            marginTop: 18,
            color: color.secondary,
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: 2,
            ...lift(tagline),
          }}
        >
          {outro.tagline}
        </div>
        <div
          style={{
            marginTop: 44,
            padding: '12px 26px',
            borderRadius: 999,
            background: 'rgba(255,255,255,.08)',
            boxShadow: `inset 0 0 0 1px ${color.hairline}`,
            color: color.text,
            fontSize: 26,
            fontWeight: 500,
            ...lift(repo),
          }}
        >
          {outro.repo}
        </div>
      </AbsoluteFill>
    </SceneShell>
  )
}
