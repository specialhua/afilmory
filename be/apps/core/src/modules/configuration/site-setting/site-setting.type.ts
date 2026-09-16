import type { UiSchema } from '../../ui/ui-schema/ui-schema.type'
import type { SettingEntryInput } from '../setting/setting.service'
import type { SettingKeyType } from '../setting/setting.type'

export const SITE_SETTING_KEYS = [
  'site.name',
  'site.title',
  'site.description',
  'site.url',
  'site.accentColor',
  'site.viewer.regions.labelPlacement',
  'site.social.twitter',
  'site.social.github',
  'site.feed.folo.challenge.feedId',
  'site.feed.folo.challenge.userId',
  'site.map.providers',
  'site.mapStyle',
  'site.mapProjection',
] as const satisfies readonly SettingKeyType[]

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number]

export const ONBOARDING_SITE_SETTING_KEYS = [
  'site.name',
  'site.title',
  'site.description',
] as const satisfies readonly SiteSettingKey[]

export type SiteSettingEntryInput = Extract<SettingEntryInput, { key: SiteSettingKey }>

export interface SiteSettingUiSchemaResponse {
  readonly schema: UiSchema<SiteSettingKey>
  readonly values: Partial<Record<SiteSettingKey, string | null>>
}
