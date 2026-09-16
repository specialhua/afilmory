import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Locale } from '../i18n'
import { otherLocale, resolveLocale, t as translate } from '../i18n'
import { BentoGrid } from './BentoGrid'
import { CreateSpaceModal } from './CreateSpaceModal'
import { Discover } from './Discover'
import { HeroSection } from './HeroSection'
import { LiveDemo } from './LiveDemo'
import { LoginSpaceModal } from './LoginSpaceModal'

const DOCS_URL = (import.meta.env.PUBLIC_DOCS_URL as string | undefined) ?? 'https://docs.afilmory.art'
const GITHUB_URL = (import.meta.env.PUBLIC_GITHUB_URL as string | undefined) ?? 'https://github.com/Afilmory/Afilmory'
const SELF_HOST_URL = `${GITHUB_URL}#option-2-self-hosting`
const APP_STORE_URL = 'https://apps.apple.com/app/id6796660831'

export interface LandingAppProps {
  initialLocale?: string
}

export function LandingApp({ initialLocale }: LandingAppProps) {
  const [locale] = useState<Locale>(() => resolveLocale(initialLocale))
  const [createOpen, setCreateOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const copy = useMemo(() => translate(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = copy.meta.title
  }, [locale, copy.meta.title])

  const openCreate = useCallback(() => setCreateOpen(true), [])
  const closeCreate = useCallback(() => setCreateOpen(false), [])
  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

  const switchLocale = () => {
    const next = otherLocale(locale)
    try {
      localStorage.setItem('afilmory-site-locale', next)
    }
    catch {
      /* ignore */
    }
    window.location.href = next === 'en' ? '/en/' : '/'
  }

  return (
    <>
      <header className="site-header fixed inset-x-0 top-0 z-50 border-b border-line bg-page-80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <a href={locale === 'en' ? '/en/' : '/'} className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" width={28} height={28} className="site-logo" />
            <span className="font-serif text-xl tracking-wide">Afilmory</span>
          </a>
          <nav className="flex items-center gap-4 text-xs tracking-wide text-muted md:gap-6">
            <a href="#features" className="nav-link-desktop hover:text-fg transition-colors">
              {copy.nav.features ?? 'Features'}
            </a>
            <a href="#demo" className="nav-link-desktop hover:text-fg transition-colors">
              {copy.nav.demo}
            </a>
            <a href="#discover" className="nav-link-desktop hover:text-fg transition-colors">
              {copy.nav.discover}
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="nav-link-wide hover:text-fg transition-colors"
            >
              {copy.nav.docs}
            </a>
            <button
              type="button"
              onClick={switchLocale}
              className="font-mono text-xs tracking-wider text-dim hover:text-fg transition-colors"
            >
              {copy.nav.lang}
            </button>
            <button type="button" className="hover:text-fg transition-colors" onClick={openLogin}>
              {copy.nav.login}
            </button>
            <button type="button" className="btn btn-compact" onClick={openCreate}>
              {copy.nav.create}
            </button>
          </nav>
        </div>
      </header>

      <main>
        <HeroSection locale={locale} onCreate={openCreate} onLogin={openLogin} />
        <BentoGrid locale={locale} />
        <LiveDemo locale={locale} onCreate={openCreate} />
        <Discover locale={locale} />
      </main>

      <footer className="border-t border-line px-5 py-16 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-serif text-2xl tracking-tight">{copy.footer.copy}</p>
            <p className="mt-2 font-mono text-xs text-dim">afilmory.art · Craft with light and glass</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs tracking-wide text-muted">
            <a href={locale === 'en' ? '/en/terms/' : '/terms/'} className="hover:text-fg transition-colors">
              {copy.footer.terms}
            </a>
            <a href={locale === 'en' ? '/en/privacy/' : '/privacy/'} className="hover:text-fg transition-colors">
              {copy.footer.privacy}
            </a>
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">
              {copy.footer.docs}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">
              {copy.footer.github}
            </a>
            <a href={SELF_HOST_URL} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">
              {copy.footer.selfHost}
            </a>
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">
              {copy.footer.appStore}
            </a>
          </div>
        </div>
      </footer>

      <CreateSpaceModal open={createOpen} onClose={closeCreate} locale={locale} />
      <LoginSpaceModal open={loginOpen} onClose={closeLogin} locale={locale} />
    </>
  )
}
