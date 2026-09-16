import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import type { DemoPhoto } from '../lib/demo'
import {
  DEMO_CHAPTERS,
  DEMO_GALLERY,
  DEMO_PHOTOS,
  formatAperture,
  formatDateTime,
  formatFileSize,
  formatMegaPixels,
} from '../lib/demo'
import { deriveAccentFromImage } from '../lib/demo-accent'
import { IconAperture, IconFocalLens, IconIso, IconShutter } from './demo-icons'

export interface LiveDemoProps {
  locale: Locale
  onCreate: () => void
}

function AppHeader({ count }: { count: number }) {
  return (
    <header className="demo-app-header">
      <div className="demo-app-brand">
        <img className="demo-app-avatar" src={DEMO_GALLERY.avatar} alt="" width={28} height={28} />
        <span className="demo-app-title">{DEMO_GALLERY.name}</span>
        <span className="demo-app-count">{count}</span>
      </div>
    </header>
  )
}

const MASONRY_GUTTER = 4

function MasonryGrid({ onOpen }: { onOpen: (photo: DemoPhoto) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [innerWidth, setInnerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const measure = () => {
      const next = Math.round(el.clientWidth - MASONRY_GUTTER * 2)
      setInnerWidth(prev => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    if (innerWidth <= 0) {
      return null
    }
    const columnCount = Math.min(4, Math.max(2, Math.round(innerWidth / 280)))
    const columnWidth = (innerWidth - (columnCount - 1) * MASONRY_GUTTER) / columnCount
    const columnHeights = Array.from<number>({ length: columnCount }).fill(0)
    const tiles = DEMO_PHOTOS.map((photo) => {
      const height = columnWidth / photo.aspectRatio
      const column = columnHeights.indexOf(Math.min(...columnHeights))
      const x = column * (columnWidth + MASONRY_GUTTER)
      const y = columnHeights[column]
      columnHeights[column] += height + MASONRY_GUTTER
      return { photo, x, y, width: columnWidth, height }
    })
    return { tiles, height: Math.max(...columnHeights) - MASONRY_GUTTER }
  }, [innerWidth])

  return (
    <div ref={scrollRef} className="demo-masonry-scroll">
      <div className="demo-masonry" style={layout ? { height: layout.height } : undefined}>
        {layout?.tiles.map(({ photo, x, y, width, height }) => {
          const aperture = formatAperture(photo.exif.aperture)
          const fl35 = photo.exif.focalLength35mm
          return (
            <button
              key={photo.id}
              type="button"
              className="demo-tile"
              style={{ top: y, left: x, width, height }}
              onClick={() => onOpen(photo)}
            >
              <img className="demo-tile-img" src={photo.src} alt={photo.title} loading="lazy" />
              <div className="demo-tile-shade" />
              <div className="demo-tile-meta">
                <h3 className="demo-tile-title">{photo.title}</h3>
                <div className="demo-tile-sub">
                  <span>{photo.format}</span>
                  <span>•</span>
                  <span>{`${photo.width} × ${photo.height}`}</span>
                  <span>•</span>
                  <span>{formatFileSize(photo.size)}</span>
                </div>
                {height >= 200 ? (
                  <div className="demo-tile-exif">
                    {fl35 != null ? (
                      <span className="demo-chip">
                        <IconFocalLens className="demo-chip-icon" />
                        {fl35}
                        mm
                      </span>
                    ) : null}
                    {aperture ? (
                      <span className="demo-chip">
                        <IconAperture className="demo-chip-icon" />
                        {aperture}
                      </span>
                    ) : null}
                    {photo.exif.shutter ? (
                      <span className="demo-chip">
                        <IconShutter className="demo-chip-icon" />
                        {photo.exif.shutter}
                      </span>
                    ) : null}
                    {photo.exif.iso != null ? (
                      <span className="demo-chip">
                        <IconIso className="demo-chip-icon" />
                        ISO
                        {' '}
                        {photo.exif.iso}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ExifRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="demo-exif-row">
      <span className="demo-exif-row-label">{label}</span>
      <span className="demo-exif-row-value" title={value}>
        {value}
      </span>
    </div>
  )
}

function ExifSidebar({ photo, locale }: { photo: DemoPhoto, locale: Locale }) {
  const copy = translate(locale).demo.exif
  const aperture = formatAperture(photo.exif.aperture)
  const mp = formatMegaPixels(photo.width, photo.height)
  const dateTaken = formatDateTime(photo.exif.dateTaken, locale)
  const camera = [photo.exif.make, photo.exif.model].filter(Boolean).join(' ')

  return (
    <aside className="demo-viewer-panel">
      <div className="demo-viewer-panel-glow" />
      <div className="demo-viewer-panel-head">
        <h3>{copy.headerTitle}</h3>
      </div>
      <div className="demo-viewer-panel-body">
        <div className="demo-exif-section">
          <h4>{copy.basicInfo}</h4>
          <div className="demo-exif-rows">
            <ExifRow label={copy.filename} value={photo.title} />
            <ExifRow label={copy.format} value={photo.format} />
            <ExifRow label={copy.dimensions} value={`${photo.width} × ${photo.height}`} />
            <ExifRow label={copy.size} value={formatFileSize(photo.size)} />
            {mp ? <ExifRow label={copy.pixels} value={mp} /> : null}
            {photo.exif.colorSpace ? <ExifRow label={copy.colorSpace} value={photo.exif.colorSpace} /> : null}
            {dateTaken ? <ExifRow label={copy.dateTaken} value={dateTaken} /> : null}
          </div>
        </div>

        <div className="demo-exif-section">
          <h4>{copy.captureParams}</h4>
          <div className="demo-exif-params">
            {photo.exif.focalLength35mm != null ? (
              <span className="demo-param-chip">
                <IconFocalLens className="demo-param-icon" />
                {photo.exif.focalLength35mm}
                mm
              </span>
            ) : null}
            {aperture ? (
              <span className="demo-param-chip">
                <IconAperture className="demo-param-icon" />
                {aperture}
              </span>
            ) : null}
            {photo.exif.shutter ? (
              <span className="demo-param-chip">
                <IconShutter className="demo-param-icon" />
                {photo.exif.shutter}
              </span>
            ) : null}
            {photo.exif.iso != null ? (
              <span className="demo-param-chip">
                <IconIso className="demo-param-icon" />
                ISO
                {' '}
                {photo.exif.iso}
              </span>
            ) : null}
          </div>
        </div>

        <div className="demo-exif-section">
          <h4>{copy.deviceInfo}</h4>
          <div className="demo-exif-rows">
            {camera ? <ExifRow label={copy.camera} value={camera} /> : null}
            {photo.exif.lens ? <ExifRow label={copy.lens} value={photo.exif.lens} /> : null}
            {photo.exif.focalLength ? <ExifRow label={copy.focalActual} value={photo.exif.focalLength} /> : null}
            {photo.exif.focalLength35mm != null ? (
              <ExifRow label={copy.focalEquiv} value={`${photo.exif.focalLength35mm}mm`} />
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}

function PhotoViewerPane({
  photo,
  index,
  locale,
  onIndexChange,
  onBack,
}: {
  photo: DemoPhoto
  index: number
  locale: Locale
  onIndexChange: (i: number) => void
  onBack: () => void
}) {
  const prev = () => onIndexChange((index - 1 + DEMO_PHOTOS.length) % DEMO_PHOTOS.length)
  const next = () => onIndexChange((index + 1) % DEMO_PHOTOS.length)

  const [accent, setAccent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    deriveAccentFromImage(photo.src).then((color) => {
      if (!cancelled) {
        setAccent(color)
      }
    })
    return () => {
      cancelled = true
    }
  }, [photo.src])

  return (
    <div className="demo-viewer" style={accent ? ({ '--demo-accent': accent } as CSSProperties) : undefined}>
      <div className="demo-viewer-stage">
        <button type="button" className="demo-viewer-close" onClick={onBack}>
          {locale === 'zh' ? '← 返回' : '← Back'}
        </button>
        <button type="button" className="demo-viewer-nav prev" onClick={prev} aria-label="Previous">
          ‹
        </button>
        <img className="demo-viewer-img" src={photo.src} alt={photo.title} />
        <button type="button" className="demo-viewer-nav next" onClick={next} aria-label="Next">
          ›
        </button>
      </div>
      <ExifSidebar photo={photo} locale={locale} />
      <div className="demo-viewer-thumbs">
        <div className="demo-viewer-thumbs-track">
          {DEMO_PHOTOS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={i === index ? 'demo-thumb is-active' : 'demo-thumb'}
              style={{ width: Math.round(64 * p.aspectRatio) }}
              onClick={() => onIndexChange(i)}
            >
              <img src={p.src} alt={p.title} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LiveDemo({ locale, onCreate }: LiveDemoProps) {
  const copy = translate(locale).demo
  const rootRef = useRef<HTMLElement>(null)
  const [chapter, setChapter] = useState(0)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [reduced, setReduced] = useState(false)

  const active = DEMO_PHOTOS[photoIndex] ?? DEMO_PHOTOS[0]

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (reduced) {
      return
    }
    const root = rootRef.current
    if (!root) {
      return
    }

    const onScroll = () => {
      const rect = root.getBoundingClientRect()
      const total = root.offsetHeight - window.innerHeight
      if (total <= 0) {
        return
      }
      const raw = Math.min(1, Math.max(0, -rect.top / total))
      const next = Math.min(DEMO_CHAPTERS.length - 1, Math.floor(raw * DEMO_CHAPTERS.length))
      setChapter(next)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reduced])

  const seek = (index: number) => {
    setChapter(index)
    if (reduced) {
      document.getElementById(`demo-chapter-${index}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    const root = rootRef.current
    if (!root) {
      return
    }
    const total = root.offsetHeight - window.innerHeight
    const top = root.offsetTop + ((index + 0.12) / DEMO_CHAPTERS.length) * total
    window.scrollTo({ top, behavior: 'smooth' })
  }

  const openPhoto = (photo: DemoPhoto) => {
    const i = DEMO_PHOTOS.findIndex(p => p.id === photo.id)
    if (i >= 0) {
      setPhotoIndex(i)
    }
    seek(1)
  }

  const chapterCopy = useMemo(() => (id: (typeof DEMO_CHAPTERS)[number]['id']) => copy.chapters[id], [copy])

  const appShell = (
    <div className="demo-app">
      <AppHeader count={DEMO_PHOTOS.length} />
      <div className="demo-app-body">
        <div className={chapter === 0 ? 'demo-layer is-visible' : 'demo-layer is-hidden'}>
          <MasonryGrid onOpen={openPhoto} />
        </div>
        <div className={chapter === 1 ? 'demo-layer is-visible' : 'demo-layer is-hidden'}>
          {active ? (
            <PhotoViewerPane
              photo={active}
              index={photoIndex}
              locale={locale}
              onIndexChange={setPhotoIndex}
              onBack={() => seek(0)}
            />
          ) : null}
        </div>
        <div className={chapter === 2 ? 'demo-layer is-visible' : 'demo-layer is-hidden'}>
          <div className="demo-create-pane">
            <div className="demo-create-card">
              <div className="eyebrow">
                {copy.chapters.create.index}
                {' '}
                / create
              </div>
              <h3>{copy.chapters.create.title}</h3>
              <p>{copy.chapters.create.body}</p>
              <div className="demo-create-cta">
                <button type="button" className="btn" onClick={onCreate}>
                  {copy.chapters.create.cta}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (reduced) {
    return (
      <section id="demo" className="border-t border-line px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl space-y-12">
          <p className="font-mono text-xs tracking-widest uppercase text-dim">{copy.label}</p>
          {DEMO_CHAPTERS.map((ch, i) => {
            const c = chapterCopy(ch.id)
            return (
              <div key={ch.id} id={`demo-chapter-${i}`} className="space-y-4">
                <div>
                  <p className="font-mono text-xs tracking-widest text-accent">{c.index}</p>
                  <h2 className="mt-2 font-serif text-3xl">{c.title}</h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{c.body}</p>
                </div>
                {i === 0 ? (
                  <div className="demo-app demo-app-fixed-a">
                    <AppHeader count={DEMO_PHOTOS.length} />
                    <div className="demo-app-body">
                      <MasonryGrid onOpen={openPhoto} />
                    </div>
                  </div>
                ) : null}
                {i === 1 && active ? (
                  <div className="demo-app demo-app-fixed-b">
                    <AppHeader count={DEMO_PHOTOS.length} />
                    <div className="demo-app-body">
                      <PhotoViewerPane
                        photo={active}
                        index={photoIndex}
                        locale={locale}
                        onIndexChange={setPhotoIndex}
                        onBack={() => {}}
                      />
                    </div>
                  </div>
                ) : null}
                {i === 2 ? (
                  <button type="button" className="btn" onClick={onCreate}>
                    {copy.chapters.create.cta}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section id="demo" ref={rootRef} className="demo-sticky-root relative border-t border-line">
      <div className="sticky top-0 flex h-svh flex-col">
        <div className="demo-sticky-frame mx-auto w-full max-w-6xl px-5 md:px-8">
          <div className="demo-sticky-copy flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-mono text-xs tracking-widest uppercase text-dim">{copy.label}</p>
              <p className="mt-2 font-mono text-xs tracking-widest text-accent">
                {chapterCopy(DEMO_CHAPTERS[chapter].id).index}
                {' '}
                /
                {DEMO_CHAPTERS[chapter].id}
              </p>
              <h2 className="mt-2 font-serif text-2xl md:text-3xl">{chapterCopy(DEMO_CHAPTERS[chapter].id).title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{chapterCopy(DEMO_CHAPTERS[chapter].id).body}</p>
            </div>
            <div className="flex gap-2">
              {DEMO_CHAPTERS.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => seek(i)}
                  className={
                    i === chapter
                      ? 'border border-accent px-2 py-1 font-mono text-xs tracking-wider text-accent'
                      : 'border border-line px-2 py-1 font-mono text-xs tracking-wider text-dim hover:text-fg'
                  }
                >
                  {chapterCopy(ch.id).index}
                </button>
              ))}
            </div>
          </div>
          <div className="demo-sticky-stage">{appShell}</div>
        </div>
      </div>
    </section>
  )
}
