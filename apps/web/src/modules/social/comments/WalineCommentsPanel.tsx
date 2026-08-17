import '@waline/client/waline.css'
import './waline.css'

import { init } from '@waline/client'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { siteConfig } from '~/config'

import { getWalineCommentPath, getWalineServerURL } from './waline'

export const WalineCommentsPanel = ({ photoId }: { photoId: string }) => {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const walineConfig = siteConfig.comments?.waline
  const path = getWalineCommentPath(photoId)
  const placeholder = t('comments.placeholder')
  // Waline 用 `sofa` 表示无评论时的空状态文案，复用自建面板的同一个 key 保持两处一致
  const emptyText = t('comments.empty')

  useEffect(() => {
    const container = containerRef.current
    const serverURL = getWalineServerURL()

    if (!container || !serverURL) {
      return
    }

    const instance = init({
      el: container,
      serverURL,
      path,
      lang: walineConfig?.lang || i18n.language || 'zh-CN',
      login: 'disable',
      meta: ['nick', 'mail', 'link'],
      requiredMeta: ['nick', 'mail'],
      pageSize: 20,
      dark: 'html.dark',
      locale: {
        placeholder,
        sofa: emptyText,
      },
    })

    return () => {
      instance?.destroy()
    }
  }, [emptyText, i18n.language, path, placeholder, walineConfig?.lang, walineConfig?.serverURL])

  if (!getWalineServerURL()) {
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
