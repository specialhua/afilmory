const BG = { r: 28, g: 28, b: 30 }

interface RGB {
  r: number
  g: number
  b: number
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function luminance({ r, g, b }: RGB): number {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

function contrastRatio(c1: RGB, c2: RGB): number {
  const L1 = luminance(c1)
  const L2 = luminance(c2)
  const [a, b] = L1 >= L2 ? [L1, L2] : [L2, L1]
  return (a + 0.05) / (b + 0.05)
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function clampAccentContrast(accent: RGB, min = 2.2, max = 4.5): RGB {
  const cr = contrastRatio(accent, BG)
  if (cr >= min && cr <= max) {
    return accent
  }
  if (cr > max) {
    for (let t = 0.05; t <= 1; t += 0.05) {
      const candidate = mix(accent, BG, t)
      if (contrastRatio(candidate, BG) <= max) {
        return candidate
      }
    }
    return mix(accent, BG, 0.8)
  }
  const white = { r: 255, g: 255, b: 255 }
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(accent, white, t)
    if (contrastRatio(candidate, BG) >= min) {
      return candidate
    }
  }
  return mix(accent, white, 0.8)
}

function averageColorFromImage(img: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return null
  }
  const w = 16
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
  canvas.width = w
  canvas.height = h
  ctx.drawImage(img, 0, 0, w, h)
  try {
    const { data } = ctx.getImageData(0, 0, w, h)
    let r = 0
    let g = 0
    let b = 0
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        continue
      }
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
    if (count === 0) {
      return null
    }
    return rgbToHex(clampAccentContrast({ r: r / count, g: g / count, b: b / count }))
  }
  catch {
    return null
  }
}

const cache = new Map<string, string | null>()

export async function deriveAccentFromImage(src: string): Promise<string | null> {
  const cached = cache.get(src)
  if (cached !== undefined) {
    return cached
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'Anonymous'
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = src
    })
    const color = averageColorFromImage(img)
    cache.set(src, color)
    return color
  }
  catch {
    cache.set(src, null)
    return null
  }
}
