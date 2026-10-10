import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { chromium } from 'playwright'

import { DPR, prepare, record, VIEWPORT } from './capture'
import { scenes, SITE } from './scenes'

async function main() {
  const outDir = path.resolve(import.meta.dirname, '../public/clips')
  mkdirSync(outDir, { recursive: true })

  const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(scenes)
  const browser = await chromium.launch({ channel: 'chrome', args: ['--hide-scrollbars'] })

  for (const name of names) {
    const scene = scenes[name]
    if (!scene) {
      throw new Error(`unknown scene: ${name}`)
    }
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
      colorScheme: 'dark',
      locale: 'en-US',
    })
    await context.route(/\/api\/(act\/views|reactions\/add)/, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    const page = await context.newPage()
    await prepare(page)
    await page.goto(SITE + scene.url, { waitUntil: 'networkidle' })
    await scene.setup?.(page)
    await record(page, path.join(outDir, `${name}.mp4`), () => scene.run(page))
    await context.close()
  }

  await browser.close()
}

main()
