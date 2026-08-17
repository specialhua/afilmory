import { useEffect, useState } from 'react'

export interface VisualViewportState {
  /**
   * 视觉视口高度：已排除软键盘与浏览器底部工具栏占用的部分。
   */
  height: number

  /**
   * 布局视口底部被遮挡的高度（软键盘 / 浏览器工具栏）。
   *
   * iOS Safari 弹出键盘时不会改变 `window.innerHeight`，只有 `visualViewport` 变化；
   * iOS Firefox 则会直接把布局视口缩小，此时该值接近 0。
   */
  bottomInset: number
}

const FALLBACK_STATE: VisualViewportState = { height: 0, bottomInset: 0 }

const readVisualViewport = (): VisualViewportState => {
  if (typeof window === 'undefined') {
    return FALLBACK_STATE
  }

  const { visualViewport } = window
  if (!visualViewport) {
    return { height: window.innerHeight, bottomInset: 0 }
  }

  return {
    height: Math.round(visualViewport.height),
    bottomInset: Math.max(0, Math.round(window.innerHeight - (visualViewport.height + visualViewport.offsetTop))),
  }
}

/**
 * 跟踪 `window.visualViewport`，用于把浮层锚定在软键盘之上。
 */
export const useVisualViewport = (): VisualViewportState => {
  const [state, setState] = useState(readVisualViewport)

  useEffect(() => {
    let timers: number[] = []

    const update = () => {
      setState((prev) => {
        const next = readVisualViewport()
        return prev.height === next.height && prev.bottomInset === next.bottomInset ? prev : next
      })
    }

    // 键盘收放期间视口数值会连续变化，且部分浏览器（iOS Firefox）收起键盘后只派发
    // visualViewport 事件甚至不派发，这里在焦点变化后多采样几次兜底。
    const resample = () => {
      timers.forEach(id => window.clearTimeout(id))
      timers = [0, 150, 350, 600].map(delay => window.setTimeout(update, delay))
    }

    update()

    const { visualViewport } = window
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('focusin', resample)
    window.addEventListener('focusout', resample)

    return () => {
      timers.forEach(id => window.clearTimeout(id))
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('focusin', resample)
      window.removeEventListener('focusout', resample)
    }
  }, [])

  return state
}
