import type { ReactNode } from 'react'
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion'

import { footage, footageSeconds, FPS, intro, music, outro, TRANSITION_FRAMES } from './copy'
import { FootageScene } from './scenes/FootageScene'
import { Intro } from './scenes/Intro'
import { Outro } from './scenes/Outro'
import { color } from './theme'

const scenes: { key: string, frames: number, node: ReactNode }[] = [
  { key: 'intro', frames: Math.round(intro.seconds * FPS), node: <Intro /> },
  ...footage.map(f => ({ key: f.id, frames: Math.round(footageSeconds(f) * FPS), node: <FootageScene scene={f} /> })),
  { key: 'outro', frames: Math.round(outro.seconds * FPS), node: <Outro /> },
]

export const totalFrames = scenes.reduce((sum, s) => sum + s.frames, 0) - TRANSITION_FRAMES * (scenes.length - 1)

export function Promo() {
  let from = 0
  return (
    <AbsoluteFill style={{ background: color.background }}>
      {scenes.map((s) => {
        const start = from
        from += s.frames - TRANSITION_FRAMES
        return (
          <Sequence key={s.key} name={s.key} from={start} durationInFrames={s.frames}>
            {s.node}
          </Sequence>
        )
      })}
      {music && (
        <Audio
          src={staticFile(music)}
          volume={f =>
            interpolate(f, [0, FPS, totalFrames - FPS, totalFrames], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}
        />
      )}
    </AbsoluteFill>
  )
}
