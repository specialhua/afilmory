import { useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import { DEMO_PHOTOS } from '../lib/demo'

export function BentoGrid({ locale }: { locale: Locale }) {
  const copy = translate(locale).bento
  const [activePhotoIdx, setActivePhotoIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const currentPhoto = DEMO_PHOTOS[activePhotoIdx] ?? DEMO_PHOTOS[0]

  const copyCommand = () => {
    navigator.clipboard.writeText('docker run -d -p 3000:3000 afilmory/core')
    setCopied(true)
    setTimeout(setCopied, 2000, false)
  }

  return (
    <section id="features" className="relative border-t border-line px-5 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <p className="font-mono text-xs tracking-widest uppercase text-accent">{copy.eyebrow}</p>
          <h2 className="mt-4 font-serif text-3xl md:text-5xl">{copy.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted md:text-base">{copy.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20 md:col-span-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-accent">{copy.exif.badge}</span>
                <span className="font-mono text-xs text-dim">X-T5 · XF23mmF1.4</span>
              </div>
              <h3 className="mt-3 font-serif text-2xl md:text-3xl">{copy.exif.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted md:text-sm">{copy.exif.description}</p>
            </div>

            <div className="mt-8 rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="font-mono text-[11px] text-dim">APERTURE</span>
                  <p className="mt-1 font-mono text-lg text-fg">
                    {currentPhoto.exif.aperture ? `ƒ/${currentPhoto.exif.aperture}` : 'ƒ/1.4'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="font-mono text-[11px] text-dim">SHUTTER</span>
                  <p className="mt-1 font-mono text-lg text-fg">{currentPhoto.exif.shutter ?? '1/250s'}</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="font-mono text-[11px] text-dim">ISO</span>
                  <p className="mt-1 font-mono text-lg text-fg">{currentPhoto.exif.iso ?? '160'}</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="font-mono text-[11px] text-dim">FOCAL</span>
                  <p className="mt-1 font-mono text-lg text-fg">{currentPhoto.exif.focalLength ?? '23mm'}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-muted">
                <span className="font-mono">{currentPhoto.exif.model ?? 'FUJIFILM X-T5'}</span>
                <span className="font-mono text-dim">{currentPhoto.exif.lens ?? 'XF23mmF1.4 R LM WR'}</span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">{copy.color.badge}</span>
              <h3 className="mt-3 font-serif text-2xl">{copy.color.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{copy.color.description}</p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex gap-2">
                {DEMO_PHOTOS.slice(0, 4).map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    className={`relative h-14 w-full overflow-hidden rounded-lg border transition-all ${
                      activePhotoIdx === idx
                        ? 'border-accent scale-105'
                        : 'border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={p.src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs">
                <span className="font-mono text-dim">Adaptive Ambience</span>
                <span className="flex items-center gap-1.5 font-mono text-fg">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
                  WCAG Balanced
                </span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">{copy.live.badge}</span>
              <h3 className="mt-3 font-serif text-2xl">{copy.live.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{copy.live.description}</p>
            </div>

            <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black/50 group">
              <img
                src={DEMO_PHOTOS[1]?.src ?? DEMO_PHOTOS[0].src}
                alt=""
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-2.5 py-1 text-[11px] backdrop-blur-md text-fg">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Motion & Audio
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">{copy.map.badge}</span>
              <h3 className="mt-3 font-serif text-2xl">{copy.map.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{copy.map.description}</p>
            </div>

            <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-[#090b10] p-4 flex flex-col justify-between">
              <div className="grid grid-cols-6 grid-rows-4 gap-1 opacity-20 h-full w-full absolute inset-0 p-3 pointer-events-none">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="border-t border-l border-white/20" />
                ))}
              </div>
              <div className="relative z-10 flex justify-between text-[11px] font-mono text-dim">
                <span>35.6764° N</span>
                <span>139.6500° E</span>
              </div>
              <div className="relative z-10 flex items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <span className="absolute h-10 w-10 animate-ping rounded-full bg-accent/20" />
                  <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg">
                    12
                  </span>
                </div>
              </div>
              <div className="relative z-10 text-center font-mono text-[11px] text-muted">
                MapLibre GL Vector Tile Cluster
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-card/60 p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-accent">{copy.arch.badge}</span>
              <h3 className="mt-3 font-serif text-2xl">{copy.arch.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{copy.arch.description}</p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <code className="font-mono text-xs text-muted truncate">docker run -d afilmory/core</code>
                <button
                  type="button"
                  onClick={copyCommand}
                  className="shrink-0 font-mono text-xs text-accent hover:underline ml-2"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-dim font-mono">
                <span>S3 / Cloudflare / MinIO</span>
                <span>PostgreSQL / SQLite</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
