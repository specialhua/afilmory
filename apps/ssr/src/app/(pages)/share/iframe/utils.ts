import type { PhotoManifestItem, PickedExif } from '@afilmory/builder'
import { formatShutterSpeed } from '@afilmory/utils'
import siteConfig from '@config'

export function decompressThumbHash(compressed: string) {
  return Uint8Array.from(compressed.match(/.{1,2}/g)!.map((b) => Number.parseInt(b, 16)))
}

export function getPhotoDetailUrl(photoId: string) {
  const base = siteConfig.url.replace(/\/$/, '')
  return `${base}/photos/${photoId}`
}

export function getSiteName() {
  try {
    return new URL(siteConfig.url).hostname.replace(/^www\./, '')
  } catch {
    return siteConfig.name
  }
}

interface ExifChip {
  label: string
}

export function formatExifChips(exif: PickedExif | null | undefined): ExifChip[] {
  if (!exif) {
    return []
  }
  const chips: ExifChip[] = []
  const focal = exif.FocalLengthIn35mmFormat
    ? `${Number.parseInt(String(exif.FocalLengthIn35mmFormat))}mm`
    : exif.FocalLength
      ? `${Number.parseInt(String(exif.FocalLength))}mm`
      : null
  if (focal) {
    chips.push({ label: focal })
  }
  if (exif.FNumber) {
    chips.push({ label: `f/${exif.FNumber}` })
  }
  const shutter = formatShutterSpeed(exif.ExposureTime)
  if (shutter) {
    chips.push({ label: shutter })
  }
  if (exif.ISO) {
    chips.push({ label: `ISO ${exif.ISO}` })
  }
  return chips
}

export function formatPhotoSub(photo: PhotoManifestItem): string[] {
  const parts: string[] = []
  const make = photo.exif?.Make
  const model = photo.exif?.Model
  if (model) {
    parts.push(make && !model.toLowerCase().includes(make.toLowerCase()) ? `${make} ${model}` : model)
  } else if (make) {
    parts.push(make)
  }
  const lens = photo.exif?.LensModel
  if (lens) {
    parts.push(lens)
  }
  const city = photo.location?.city
  if (city) {
    parts.push(city)
  }
  if (photo.dateTaken) {
    const d = new Date(photo.dateTaken)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      parts.push(`${y}·${m}·${day}`)
    }
  }
  return parts
}

export function pickCollectionLayout(requested: string | undefined, photoCount: number): 'grid' | 'strip' {
  if (requested === 'grid' || requested === 'strip') {
    return requested
  }
  return photoCount <= 4 ? 'strip' : 'grid'
}

export function parseLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) {
    return 9
  }
  return Math.max(1, Math.min(24, n))
}
