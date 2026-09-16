import { clsxm, focusRing } from '@afilmory/utils'
import type { ButtonHTMLAttributes } from 'react'

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  pill?: boolean
}

export const ActionButton = ({
  className,
  active = false,
  pill = false,
  type = 'button',
  children,
  ...props
}: ActionButtonProps) => {
  return (
    <button
      type={type}
      className={clsxm(
        focusRing,
        'focus-visible:outline-accent',
        'pointer-events-auto inline-flex size-8 shrink-0 items-center justify-center gap-1.5 rounded-full',
        'border border-white/10 bg-material-ultra-thick text-white backdrop-blur-2xl',
        'duration-200 hover:border-white/15 hover:bg-black/40 disabled:cursor-default',
        pill && 'w-auto px-3',
        active && 'border-accent/20 bg-accent hover:border-accent/20 hover:bg-accent/90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
