import { Composition } from 'remotion'

import { FPS } from './copy'
import { Promo, totalFrames } from './Promo'

export function Root() {
  return (
    <Composition id="Promo" component={Promo} width={1920} height={1080} fps={FPS} durationInFrames={totalFrames} />
  )
}
