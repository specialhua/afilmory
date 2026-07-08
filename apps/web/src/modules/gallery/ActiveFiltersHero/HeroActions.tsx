import { Spring } from '@afilmory/utils'
import { Pencil, X } from 'lucide-react'
import { m as motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

interface HeroActionsProps {
  onClearAll: () => void
  onEditFilters: () => void
}

export const HeroActions = ({ onClearAll, onEditFilters }: HeroActionsProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-2">
      <motion.button
        type="button"
        onClick={onEditFilters}
        aria-label={t('gallery.filter.edit')}
        className="flex items-center gap-1.5 rounded-lg bg-transparent px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={Spring.presets.snappy}
      >
        <Pencil className="size-3" aria-hidden="true" />
        <span>{t('gallery.filter.edit')}</span>
      </motion.button>
      <motion.button
        type="button"
        onClick={onClearAll}
        aria-label={t('gallery.filter.clearAll')}
        className="flex items-center gap-1.5 rounded-lg bg-transparent px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={Spring.presets.snappy}
      >
        <X className="size-3" aria-hidden="true" />
        <span>{t('gallery.filter.clearAll')}</span>
      </motion.button>
    </div>
  )
}
