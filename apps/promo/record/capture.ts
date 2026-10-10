import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import type { CDPSession, Page } from 'playwright'

export const VIEWPORT = { width: 1600, height: 1000 }
export const DPR = 2
const FPS = 60

const cursorScript = `
addEventListener('DOMContentLoaded', () => {
  const el = document.createElement('div')
  el.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L8.5 18.8 L12.3 27.4 L16.2 25.7 L12.5 17.3 L20 17.3 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  Object.assign(el.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transformOrigin: '3px 2px', transition: 'scale 120ms ease-out', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))', translate: '-100px -100px' })
  document.documentElement.append(el)
  addEventListener('mousemove', (e) => { el.style.translate = (e.clientX - 3) + 'px ' + (e.clientY - 2) + 'px' }, true)
  addEventListener('mousedown', () => { el.style.scale = '0.82' }, true)
  addEventListener('mouseup', () => { el.style.scale = '1' }, true)
})
`

export async function prepare(page: Page) {
  await page.addInitScript(cursorScript)
}

// kept as a string so tsx's __name helpers never reach the page
const smoothScroll = `([dy, ms, selector]) => new Promise((resolve) => {
  const target = document.querySelector(selector)
  const start = target.scrollTop
  const t0 = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - t0) / ms)
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    target.scrollTop = start + dy * e
    if (t < 1) requestAnimationFrame(tick)
    else resolve()
  }
  requestAnimationFrame(tick)
})`

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function actions(page: Page) {
  let cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.7 }

  const moveTo = async (x: number, y: number, ms = 700) => {
    const from = cursor
    const steps = Math.max(2, Math.round(ms / 16))
    const bend = (Math.random() - 0.5) * 0.18
    for (let i = 1; i <= steps; i++) {
      const t = ease(i / steps)
      const arc = Math.sin(Math.PI * t) * bend
      await page.mouse.move(
        from.x + (x - from.x) * t - (y - from.y) * arc,
        from.y + (y - from.y) * t + (x - from.x) * arc,
      )
      await page.waitForTimeout(16)
    }
    cursor = { x, y }
  }

  const click = async (x: number, y: number, ms?: number) => {
    await moveTo(x, y, ms)
    await page.waitForTimeout(120)
    await page.mouse.down()
    await page.waitForTimeout(90)
    await page.mouse.up()
  }

  const clickLocator = async (selector: string, ms?: number) => {
    const box = await page.locator(selector).first().boundingBox()
    if (!box) {
      throw new Error(`no box for ${selector}`)
    }
    await click(box.x + box.width / 2, box.y + box.height / 2, ms)
  }

  const scrollBy = (dy: number, ms: number, selector = '[data-radix-scroll-area-viewport]') =>
    page.evaluate(`(${smoothScroll})(${JSON.stringify([dy, ms, selector])})`)

  const wheel = async (dy: number, ms: number) => {
    const steps = Math.round(ms / 16)
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps)
      await page.waitForTimeout(16)
    }
  }

  const type = async (text: string, delay = 110) => {
    for (const ch of text) {
      await page.keyboard.type(ch)
      await page.waitForTimeout(delay + Math.random() * 50)
    }
  }

  return { moveTo, click, clickLocator, scrollBy, wheel, type, wait: (ms: number) => page.waitForTimeout(ms) }
}

export async function record(page: Page, outFile: string, run: () => Promise<void>) {
  const framesDir = path.join(path.dirname(outFile), `.frames-${path.basename(outFile, '.mp4')}`)
  rmSync(framesDir, { recursive: true, force: true })
  mkdirSync(framesDir, { recursive: true })

  const cdp: CDPSession = await page.context().newCDPSession(page)
  const frames: { file: string, ts: number }[] = []
  const pending: Promise<unknown>[] = []

  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    const file = path.join(framesDir, `${String(frames.length).padStart(5, '0')}.jpg`)
    frames.push({ file, ts: metadata.timestamp ?? Date.now() / 1000 })
    writeFileSync(file, Buffer.from(data, 'base64'))
    pending.push(cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}))
  })

  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEWPORT.width * DPR,
    maxHeight: VIEWPORT.height * DPR,
    everyNthFrame: 1,
  })
  const startedAt = Date.now() / 1000
  await run()
  const endedAt = Date.now() / 1000
  await cdp.send('Page.stopScreencast')
  await Promise.all(pending)

  if (frames.length === 0) {
    throw new Error('no frames captured')
  }
  const span = endedAt - startedAt
  process.stdout.write(
    `${path.basename(outFile)}: ${frames.length} frames / ${span.toFixed(1)}s = ${(frames.length / span).toFixed(1)} fps\n`,
  )

  const lines: string[] = []
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.ts ?? f.ts + 1 / FPS
    lines.push(`file '${f.file}'`, `duration ${Math.max(1 / FPS, next - f.ts).toFixed(5)}`)
  })
  // concat demuxer ignores the last entry's duration, so the final frame is listed twice
  lines.push(`file '${frames.at(-1)!.file}'`)
  const listFile = path.join(framesDir, 'list.txt')
  writeFileSync(listFile, lines.join('\n'))

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-vf',
      `fps=${FPS},scale=${VIEWPORT.width * DPR}:${VIEWPORT.height * DPR}:flags=lanczos,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '14',
      outFile,
    ],
    { stdio: 'inherit' },
  )
  rmSync(framesDir, { recursive: true, force: true })
}
