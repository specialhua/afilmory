import type { Page } from 'playwright'

import { actions } from './capture'

export const SITE = 'https://innei.afilmory.art'

export interface Scene {
  url: string
  setup?: (page: Page) => Promise<void>
  run: (page: Page) => Promise<void>
}

async function waitForPhoto(page: Page) {
  await page.waitForFunction(() => !document.body.textContent?.includes('Loading'), undefined, { timeout: 60_000 })
}

export const scenes: Record<string, Scene> = {
  gallery: {
    url: '/',
    setup: async (page) => {
      await page.goto(`${SITE}/photos/DSCF6083`)
      await waitForPhoto(page)
      await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
      await page.waitForSelector('img[src*="thumbnails"]')
      const a = actions(page)
      await a.scrollBy(4000, 1500)
      await a.scrollBy(-4000, 800)
      await page.waitForLoadState('networkidle')
    },
    run: async (page) => {
      const a = actions(page)
      await a.wait(400)
      await a.moveTo(820, 520, 900)
      await a.scrollBy(1400, 2600)
      await a.wait(300)
      await a.scrollBy(-1400, 1800)
      await a.wait(300)
      await a.clickLocator('img[alt="DSCF6083"]', 900)
      await a.wait(1600)
      await waitForPhoto(page)
      await a.moveTo(640, 440, 700)
      await a.wheel(-550, 1400)
      await a.wait(500)
      await a.moveTo(560, 360, 900)
      await a.wait(600)
    },
  },

  exif: {
    url: '/photos/DSCF6083',
    setup: waitForPhoto,
    run: async (page) => {
      const a = actions(page)
      await a.wait(500)
      await a.moveTo(1440, 400, 1000)
      await a.wait(500)
      await page.mouse.wheel(0, 0)
      await a.wheel(500, 2200)
      await a.wait(700)
      await a.wheel(500, 1800)
      await a.wait(900)
    },
  },

  map: {
    url: '/map',
    setup: async (page) => {
      await page.waitForSelector('[aria-label="Map marker"]')
      await page.waitForLoadState('networkidle')
      const a = actions(page)
      await a.moveTo(800, 500, 100)
      await a.wheel(420, 600)
      await page.waitForTimeout(2000)
    },
    run: async (page) => {
      const a = actions(page)
      await a.wait(600)
      const cluster = await markerCenter(page, 'largest')
      await a.moveTo(cluster.x, cluster.y, 1200)
      await a.wait(200)
      await a.wheel(-620, 1800)
      await a.wait(1500)
      const single = await markerCenter(page, 'single')
      await a.click(single.x, single.y, 1000)
      await a.wait(2600)
    },
  },

  search: {
    url: '/',
    setup: async (page) => {
      await page.waitForSelector('img[src*="thumbnails"]')
      await page.waitForLoadState('networkidle')
    },
    run: async (page) => {
      const a = actions(page)
      await a.wait(400)
      await a.clickLocator('button[title="Search & Filter"]', 900)
      await a.wait(700)
      await a.type('东京', 260)
      await a.wait(900)
      await page.keyboard.press('Enter')
      await a.wait(900)
      await page.keyboard.press('Escape')
      await a.wait(1500)
      const photo = await firstPhotoBelow(page, 450)
      await a.click(photo.x, photo.y, 900)
      await a.wait(1400)
      await waitForPhoto(page)
      await a.wait(400)
      const fire = await page
        .locator('[aria-label="React with 🔥"]')
        .evaluateAll(els => els.map(e => e.getBoundingClientRect()).find(r => r.x > 0 && r.x < innerWidth))
      if (!fire) {
        throw new Error('no reaction button')
      }
      await a.click(fire.x + fire.width / 2, fire.y + fire.height / 2, 1000)
      await a.wait(1600)
    },
  },
}

async function markerCenter(page: Page, kind: 'largest' | 'single') {
  const boxes = await page
    .locator('[aria-label="Map marker"]')
    .evaluateAll(els => els.map(e => ({ r: e.getBoundingClientRect(), n: Number(e.textContent?.trim() || 0) })))
  const onScreen = boxes.filter(({ r }) => r.width > 0 && r.x > 40 && r.y > 40 && r.x < innerWidthOf(page) - 40)
  const pick
    = kind === 'largest'
      ? onScreen.toSorted((a, b) => b.n - a.n)[0]
      : onScreen.filter(b => b.n === 0).toSorted((a, b) => dist(a.r) - dist(b.r))[0]
  if (!pick) {
    throw new Error(`no ${kind} marker`)
  }
  return { x: pick.r.x + pick.r.width / 2, y: pick.r.y + pick.r.height / 2 }
}

const innerWidthOf = (page: Page) => page.viewportSize()!.width
const dist = (r: DOMRect) => Math.hypot(r.x - 800, r.y - 500)

async function firstPhotoBelow(page: Page, minY: number) {
  const boxes = await page
    .locator('img[src*="thumbnails"]')
    .evaluateAll(els => els.map(e => e.getBoundingClientRect()))
  const r = boxes.filter(b => b.y >= minY && b.width > 100).toSorted((a, b) => a.y - b.y || a.x - b.x)[0]
  if (!r) {
    throw new Error('no photo below')
  }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}
