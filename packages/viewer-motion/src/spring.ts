import type { Transition } from 'motion/react'

const smoothPreset: Transition = {
  type: 'spring',
  duration: 0.4,
  bounce: 0,
}

const snappyPreset: Transition = {
  type: 'spring',
  duration: 0.4,
  bounce: 0.15,
}

class ViewerSpringStatic {
  presets = {
    smooth: smoothPreset,
    snappy: snappyPreset,
  }

  smooth(duration = 0.4, extraBounce = 0): Transition {
    return {
      type: 'spring',
      duration,
      bounce: extraBounce,
    }
  }

  snappy(duration = 0.4, extraBounce = 0): Transition {
    return {
      type: 'spring',
      duration,
      bounce: 0.15 + extraBounce,
    }
  }
}

export const ViewerSpring = new ViewerSpringStatic()
