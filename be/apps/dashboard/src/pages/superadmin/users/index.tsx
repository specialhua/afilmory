import { Spring } from '@afilmory/utils'
import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { SuperAdminUserManager } from '~/modules/super-admin'

export function Component() {
  const { t } = useTranslation()
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="mx-[calc(1/2*-1*(100vw-min(var(--container-5xl),100vw)))] space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-text text-2xl font-semibold">{t('superadmin.users.title')}</h1>
        <p className="text-text-secondary text-sm">{t('superadmin.users.description')}</p>
      </header>
      <SuperAdminUserManager />
    </m.div>
  )
}
