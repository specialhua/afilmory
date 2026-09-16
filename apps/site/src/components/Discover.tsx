import { useEffect, useState } from 'react'

import type { Locale } from '../i18n'
import { t as translate } from '../i18n'
import type { FeaturedGallery } from '../lib/api'
import { fetchFeaturedGalleries, galleryPublicUrl } from '../lib/api'

export function Discover({ locale }: { locale: Locale }) {
  const copy = translate(locale).discover
  const [galleries, setGalleries] = useState<FeaturedGallery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchFeaturedGalleries()
      .then((list) => {
        if (!cancelled) {
          setGalleries(list)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setGalleries([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="discover" className="border-t border-line px-5 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <p className="font-mono text-xs tracking-widest uppercase text-accent">{copy.label}</p>
            <h2 className="mt-3 font-serif text-3xl md:text-5xl">{copy.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{copy.description}</p>
          </div>
          <span className="font-mono text-xs text-dim">Curated Community Exhibitions</span>
        </div>

        <div className="mt-12">
          {loading ? (
            <p className="font-mono text-sm text-dim">{copy.loading}</p>
          ) : error ? (
            <p className="font-mono text-sm text-dim">{copy.error}</p>
          ) : galleries.length === 0 ? (
            <p className="font-mono text-sm text-dim">{copy.empty}</p>
          ) : (
            <div className="discover-rail flex gap-5 overflow-x-auto pb-4 pt-1">
              {galleries.map(g => (
                <a
                  key={g.id}
                  href={galleryPublicUrl(g)}
                  target="_blank"
                  rel="noreferrer"
                  className="discover-card group relative shrink-0 w-72 rounded-xl border border-line bg-card/60 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/30 hover:shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-2 w-2 rounded-full bg-accent/80" />
                    <span className="font-mono text-[11px] text-accent">
                      {g.photoCount}
                      {' '}
                      {copy.photos}
                    </span>
                  </div>
                  <p className="mt-4 font-serif text-xl leading-snug group-hover:text-accent transition-colors">
                    {g.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-dim">
                    {g.slug}
                    .afilmory.art
                  </p>
                  {g.description ? (
                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{g.description}</p>
                  ) : null}
                  <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] font-mono text-dim">
                    <span>Visit Gallery</span>
                    <span className="text-muted group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
