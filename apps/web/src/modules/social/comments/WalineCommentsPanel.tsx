import '@waline/client/waline.css'
import './waline.css'

import { init } from '@waline/client'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { siteConfig } from '~/config'

export const WalineCommentsPanel = ({ photoId }: { photoId: string }) => {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const walineConfig = siteConfig.comments?.waline
  const path = useMemo(() => `/photos/${photoId}`, [photoId])
  const placeholder = t('comments.placeholder')

  useEffect(() => {
    const container = containerRef.current
    const serverURL = walineConfig?.serverURL?.trim()

    if (!container || !serverURL) {
      return
    }

    const instance = init({
      el: container,
      serverURL,
      path,
      lang: walineConfig?.lang || i18n.language || 'zh-CN',
      pageSize: 20,
      dark: 'html.dark',
      locale: {
        placeholder,
      },
    })

    return () => {
      instance?.destroy()
    }
  }, [i18n.language, path, placeholder, walineConfig?.lang, walineConfig?.serverURL])

  if (!walineConfig?.serverURL) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-sm text-white/60">
        {t('comments.error')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="afilmory-waline min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div ref={containerRef} />
      </div>
    </div>
  )
}
