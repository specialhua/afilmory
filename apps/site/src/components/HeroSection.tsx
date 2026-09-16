import { useMemo, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import { DEMO_PHOTOS } from '../lib/demo'

const APP_STORE_URL = 'https://apps.apple.com/app/id6796660831'
const GITHUB_URL = (import.meta.env.PUBLIC_GITHUB_URL as string | undefined) ?? 'https://github.com/Afilmory/Afilmory'

function IconApple({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
    </svg>
  )
}

function IconGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

export interface HeroSectionProps {
  locale: Locale
  onCreate: () => void
  onLogin: () => void
}

export function HeroSection({ locale, onCreate, onLogin }: HeroSectionProps) {
  const copy = translate(locale).hero
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const currentPhoto = useMemo(() => DEMO_PHOTOS[activePhotoIdx] ?? DEMO_PHOTOS[0], [activePhotoIdx])

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 14
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -14
    setMousePos({ x, y })
  }

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 })
  }

  return (
    <section className="relative flex flex-col justify-center overflow-hidden px-5 pb-20 pt-28 md:px-8 md:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-accent/15 blur-[140px] transition-colors duration-1000" />
        <div className="absolute h-[400px] w-[700px] -translate-y-24 bg-amber-500/10 blur-[160px]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1 backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-accent">{copy.eyebrow}</span>
          </div>

          <h1 className="mt-8 font-serif text-4xl leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
            {copy.title}
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">{copy.subtitle}</p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button type="button" className="btn" onClick={onCreate}>
              {copy.cta}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onLogin}>
              {copy.login}
            </button>
            <a
              href="#demo"
              className="inline-flex items-center gap-1.5 text-sm font-medium tracking-wide text-muted hover:text-fg transition-colors"
            >
              {copy.secondary}
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6">
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="app-store-badge">
              <IconApple className="app-store-badge-icon" />
              <span className="app-store-badge-copy">
                <span className="app-store-badge-eyebrow">{copy.appStoreEyebrow}</span>
                <span className="app-store-badge-title">{copy.appStore}</span>
              </span>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card/60 px-3.5 text-xs text-muted hover:border-accent hover:text-fg transition-colors backdrop-blur-md"
            >
              <IconGithub className="h-4 w-4" />
              <span className="font-mono">GitHub Open Source</span>
            </a>
            <p className="font-mono text-xs tracking-wide text-dim">{copy.note}</p>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col items-center">
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              transform: `perspective(1000px) rotateX(${mousePos.y}deg) rotateY(${mousePos.x}deg)`,
              transition: 'transform 200ms ease-out',
            }}
            className="group relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-black/60 shadow-2xl backdrop-blur-xl"
          >
            <img
              src={currentPhoto.src}
              alt={currentPhoto.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-serif text-lg text-fg">{currentPhoto.title}</p>
                  <p className="mt-1 font-mono text-xs text-accent">
                    {currentPhoto.exif.model ?? 'FUJIFILM X-T5'}
                    {' '}
                    ·
                    {currentPhoto.exif.lens ?? 'XF23mmF1.4'}
                  </p>
                </div>
                <div className="rounded-full border border-white/20 bg-black/60 px-2.5 py-1 font-mono text-[11px] text-fg backdrop-blur-md">
                  {currentPhoto.exif.aperture ? `ƒ/${currentPhoto.exif.aperture}` : 'ƒ/1.4'}
                  {' '}
                  ·
                  {' '}
                  {currentPhoto.exif.shutter ?? '1/250s'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {DEMO_PHOTOS.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePhotoIdx(idx)}
                aria-label={`Show photo ${idx + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  activePhotoIdx === idx ? 'w-8 bg-accent' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
