export const FPS = 60
export const TRANSITION_FRAMES = 18

export const music: string | null = null

export const intro = {
  line: '你的照片，值得更好的展示',
  seconds: 3.6,
}

export const outro = {
  title: 'Afilmory',
  tagline: '开源 · 可自托管 · afilmory.art',
  repo: 'github.com/Afilmory/afilmory',
  seconds: 5,
}

export interface Segment {
  from: number
  to: number
  rate: number
}

export interface CameraKey {
  t: number
  scale: number
  fx: number
  fy: number
}

export interface Footage {
  id: string
  eyebrow: string
  caption: string
  clip: string
  segments: Segment[]
  camera: CameraKey[]
}

export const footage: Footage[] = [
  {
    id: 'gallery',
    eyebrow: '01 · 画廊',
    caption: '流畅浏览，细节尽收眼底',
    clip: 'clips/gallery.mp4',
    segments: [
      { from: 0.6, to: 9.6, rate: 1.4 },
      { from: 12.8, to: 16.2, rate: 1 },
    ],
    camera: [
      { t: 0, scale: 0.9, fx: 0.5, fy: 0.5 },
      { t: 1.4, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 6.4, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 9.6, scale: 1.18, fx: 0.4, fy: 0.45 },
    ],
  },
  {
    id: 'exif',
    eyebrow: '02 · EXIF',
    caption: '每一张照片的拍摄参数',
    clip: 'clips/exif.mp4',
    segments: [{ from: 1, to: 13, rate: 1.5 }],
    camera: [
      { t: 0, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 2.2, scale: 1.55, fx: 0.93, fy: 0.45 },
      { t: 8, scale: 1.62, fx: 0.93, fy: 0.5 },
    ],
  },
  {
    id: 'map',
    eyebrow: '03 · 地图',
    caption: '在地图上重走旅程',
    clip: 'clips/map.mp4',
    segments: [{ from: 0.5, to: 16.5, rate: 1.7 }],
    camera: [
      { t: 0, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 5, scale: 1.08, fx: 0.55, fy: 0.45 },
      { t: 9.4, scale: 1.2, fx: 0.6, fy: 0.35 },
    ],
  },
  {
    id: 'search',
    eyebrow: '04 · 搜索与互动',
    caption: '一搜即达，一键互动',
    clip: 'clips/search.mp4',
    segments: [{ from: 0.8, to: 14.4, rate: 1.4 }],
    camera: [
      { t: 0, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 1.2, scale: 1.25, fx: 0.5, fy: 0.25 },
      { t: 4, scale: 1.25, fx: 0.5, fy: 0.25 },
      { t: 5.2, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 8.2, scale: 1, fx: 0.5, fy: 0.5 },
      { t: 9.7, scale: 1.3, fx: 0.62, fy: 0.9 },
    ],
  },
]

export const footageSeconds = (f: Footage) => f.segments.reduce((sum, s) => sum + (s.to - s.from) / s.rate, 0)
