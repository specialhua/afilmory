import { isExiftoolLoadedAtom } from '~/atoms/app'

import { jotaiStore } from './jotai'
import zeroperlWasmUrl from './zeroperl.wasm?url'

const fetchZeroperlWasm = (..._args: unknown[]) => fetch(zeroperlWasmUrl)

class ExifToolManagerStatic {
  private isLoaded = false

  private exifTool: typeof import('@uswriting/exiftool') | null = null

  async load() {
    if (this.isLoaded) {
      return
    }
    const exiftool = await import('@uswriting/exiftool')
    this.exifTool = exiftool
    this.isLoaded = true

    jotaiStore.set(isExiftoolLoadedAtom, true)
  }

  constructor() {
    this.load()
  }

  async parse(buffer: Blob, filename?: string) {
    if (!this.exifTool) {
      await this.load()
    }

    if (!this.exifTool) {
      throw new Error('ExifTool not loaded')
    }
    const metadata = await this.exifTool.parseMetadata(new File([buffer], `/afilmory/${filename}`), {
      fetch: fetchZeroperlWasm,
    })

    if (!metadata.success) {
      throw new Error(metadata.error)
    }

    return metadata.data
  }
}
export const ExifToolManager = new ExifToolManagerStatic()
