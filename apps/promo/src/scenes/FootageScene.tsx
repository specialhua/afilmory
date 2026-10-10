import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

import { BrowserFrame } from '../components/BrowserFrame'
import { Caption } from '../components/Caption'
import { SceneShell } from '../components/SceneShell'
import type { CameraKey, Footage } from '../copy'
import { color } from '../theme'

const FRAME_WIDTH = 1320
const FRAME_TOP = 184

function useCamera(keys: CameraKey[]) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const times = keys.map(k => k.t * fps)
  const opts = { easing: Easing.bezier(0.45, 0, 0.2, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const at = (pick: (k: CameraKey) => number) =>
    keys.length === 1 ? pick(keys[0]) : interpolate(frame, times, keys.map(pick), opts)
  return { scale: at(k => k.scale), fx: at(k => k.fx), fy: at(k => k.fy) }
}

export function FootageScene({ scene }: { scene: Footage }) {
  const { fps } = useVideoConfig()
  const { scale, fx, fy } = useCamera(scene.camera)

  let offset = 0
  const clips = scene.segments.map((s) => {
    const frames = Math.round(((s.to - s.from) / s.rate) * fps)
    const node = (
      <Sequence key={s.from} from={offset} durationInFrames={frames} layout="none">
        <OffthreadVideo
          src={staticFile(scene.clip)}
          trimBefore={Math.round(s.from * fps)}
          playbackRate={s.rate}
          muted
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </Sequence>
    )
    offset += frames
    return node
  })

  const scrim = interpolate(scale, [1, 1.15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <SceneShell>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 55% at 50% 60%, rgba(10,132,255,.14), transparent 70%), ${color.background}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: FRAME_TOP,
          left: (1920 - FRAME_WIDTH) / 2,
          scale: String(scale),
          transformOrigin: `${fx * 100}% ${fy * 100}%`,
        }}
      >
        <BrowserFrame width={FRAME_WIDTH}>{clips}</BrowserFrame>
      </div>
      <AbsoluteFill
        style={{
          opacity: scrim,
          background: `linear-gradient(to bottom, ${color.background} 0, rgba(10,10,11,.85) 150px, transparent 300px)`,
        }}
      />
      <Caption eyebrow={scene.eyebrow} text={scene.caption} />
    </SceneShell>
  )
}
