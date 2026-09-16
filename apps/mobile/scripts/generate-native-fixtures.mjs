import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const fixtureDirectory = resolve(scriptDirectory, '../Tests/Fixtures')
const languages = ['en', 'zh-CN', 'zh-HK', 'zh-TW', 'jp', 'ko']
const port = Number(process.env.AFILMORY_FIXTURE_PORT ?? 43991)

function validate(payload) {
  if (payload.manifest?.data?.length !== 188) {
    throw new Error('Expected 188 manifest photos.')
  }
  if (payload.studioAssets?.length !== 188) {
    throw new Error('Expected 188 Studio assets.')
  }
  if (payload.normalized?.length !== 188 || payload.studioNormalized?.length !== 188) {
    throw new Error('Expected 188 normalized photos from each source.')
  }
  if (!payload.manifest.data.some(photo => photo.exif?.FujiRecipe)) {
    throw new Error('The manifest does not contain a Fuji recipe.')
  }
  if (!payload.manifest.data.some(photo => photo.exif?.GPSLatitude && photo.exif?.GPSLongitude)) {
    throw new Error('The manifest does not contain GPS data.')
  }
  if (!payload.manifest.data.some(photo => !photo.location || !photo.description || !photo.exif?.Artist)) {
    throw new Error('The manifest does not contain missing-field cases.')
  }
  for (const language of languages) {
    if (payload.headers?.[language]?.length !== 188 || payload.info?.[language]?.length !== 188) {
      throw new Error(`Expected 188 localized models for ${language}.`)
    }
  }
}

async function writeJSON(name, value) {
  await writeFile(resolve(fixtureDirectory, name), `${JSON.stringify(value, null, 2)}\n`)
}

async function persist(payload) {
  validate(payload)
  await mkdir(fixtureDirectory, { recursive: true })
  await Promise.all([
    writeJSON('manifest.json', payload.manifest),
    writeJSON('studio-assets.json', payload.studioAssets),
    writeJSON('expected-normalized.json', payload.normalized),
    writeJSON('expected-studio-normalized.json', payload.studioNormalized),
    writeJSON('expected-filters.json', payload.filters),
    ...languages.map(language => writeJSON(`expected-header-${language}.json`, payload.headers[language])),
    ...languages.map(language => writeJSON(`expected-info-${language}.json`, payload.info[language])),
  ])
}

const server = createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/native-fixtures') {
    response.writeHead(404).end()
    return
  }

  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    void persist(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      .then(() => {
        response.writeHead(204).end()
        server.close()
      })
      .catch((error) => {
        response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error))
        server.close()
        process.exitCode = 1
      })
  })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Waiting for Hermes fixture capture on http://127.0.0.1:${port}\n`)
})
