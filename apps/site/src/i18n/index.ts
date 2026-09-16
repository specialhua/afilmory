import { en } from './en'
import type { Locale, Translations } from './types'
import { zh } from './zh'

export type { Locale, Translations }

const table: Record<Locale, Translations> = { zh, en }

export function resolveLocale(input?: string | null): Locale {
  if (!input) {
    return 'zh'
  }
  const base = input.toLowerCase().split('-')[0]
  if (base === 'en') {
    return 'en'
  }
  return 'zh'
}

export function t(locale: Locale): Translations {
  return table[locale] ?? zh
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh'
}
