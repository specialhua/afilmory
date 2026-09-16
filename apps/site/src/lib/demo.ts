import raw from './demo-manifest.json'

export interface DemoExif {
  make: string | null
  model: string | null
  lens: string | null
  focalLength: string | null
  focalLength35mm: number | string | null
  aperture: number | string | null
  shutter: string | null
  iso: number | null
  dateTaken: string | null
  colorSpace: string | null
}

export interface DemoPhoto {
  id: string
  src: string
  width: number
  height: number
  aspectRatio: number
  title: string
  format: string
  size: number
  exif: DemoExif
}

export const DEMO_PHOTOS = raw as DemoPhoto[]

export const DEMO_CHAPTERS = [
  { id: 'grid', labelKey: 'grid' as const },
  { id: 'lightbox', labelKey: 'lightbox' as const },
  { id: 'create', labelKey: 'create' as const },
] as const

export type DemoChapterId = (typeof DEMO_CHAPTERS)[number]['id']

export const DEMO_GALLERY = {
  name: 'Innei\'s Afilmory',
  author: 'Innei',
  avatar: 'https://cdn.jsdelivr.net/gh/Innei/static@master/avatar.png',
}

export function formatAperture(value: DemoPhoto['exif']['aperture']): string | null {
  if (value == null || value === '') {
    return null
  }
  if (typeof value === 'number') {
    return `f/${value}`
  }
  const s = String(value)
  return s.startsWith('f') || s.startsWith('F') ? s : `f/${s}`
}

export function formatFileSize(bytes: number): string {
  if (!bytes) {
    return '—'
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function formatMegaPixels(width: number, height: number): string | null {
  if (!width || !height) {
    return null
  }
  return `${((width * height) / 1_000_000) | 0} MP`
}

export function formatDateTime(iso: string | null, locale: 'zh' | 'en'): string | null {
  if (!iso) {
    return null
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}
