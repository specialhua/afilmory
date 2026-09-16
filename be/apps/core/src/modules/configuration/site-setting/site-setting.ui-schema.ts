import type { UiSchemaTFunction } from '../../ui/ui-schema/ui-schema.i18n'
import { identityUiSchemaT } from '../../ui/ui-schema/ui-schema.i18n'
import type { UiNode, UiSchema } from '../../ui/ui-schema/ui-schema.type'
import type { SiteSettingKey } from './site-setting.type'

export const SITE_SETTING_UI_SCHEMA_VERSION = '1.1.0'

export function createSiteSettingUiSchema(t: UiSchemaTFunction): UiSchema<SiteSettingKey> {
  return {
    version: SITE_SETTING_UI_SCHEMA_VERSION,
    title: t('site.title'),
    description: t('site.description'),
    sections: [
      {
        type: 'section',
        id: 'site-basic',
        title: t('site.sections.basic.title'),
        description: t('site.sections.basic.description'),
        icon: 'layout-dashboard',
        children: [
          {
            type: 'field',
            id: 'site-name',
            title: t('site.sections.basic.fields.site-name.title'),
            description: t('site.sections.basic.fields.site-name.description'),
            key: 'site.name',
            required: true,
            component: {
              type: 'text',
              placeholder: t('site.sections.basic.fields.site-name.placeholder'),
            },
            icon: 'type',
          },
          {
            type: 'field',
            id: 'site-title',
            title: t('site.sections.basic.fields.site-title.title'),
            description: t('site.sections.basic.fields.site-title.description'),
            key: 'site.title',
            required: true,
            component: {
              type: 'text',
              placeholder: t('site.sections.basic.fields.site-title.placeholder'),
            },
            icon: 'heading-1',
          },
          {
            type: 'field',
            id: 'site-description',
            title: t('site.sections.basic.fields.site-description.title'),
            description: t('site.sections.basic.fields.site-description.description'),
            key: 'site.description',
            required: true,
            component: {
              type: 'textarea',
              placeholder: t('site.sections.basic.fields.site-description.placeholder'),
              minRows: 3,
              maxRows: 6,
            },
            icon: 'align-left',
          },
          {
            type: 'field',
            id: 'site-url',
            title: t('site.sections.basic.fields.site-url.title'),
            description: t('site.sections.basic.fields.site-url.description'),
            key: 'site.url',
            required: true,
            component: {
              type: 'text',
              inputType: 'url',
              placeholder: t('site.sections.basic.fields.site-url.placeholder'),
              autoComplete: 'url',
            },
            icon: 'globe',
          },
          {
            type: 'field',
            id: 'site-accent-color',
            title: t('site.sections.basic.fields.site-accent-color.title'),
            description: t('site.sections.basic.fields.site-accent-color.description'),
            helperText: t('site.sections.basic.fields.site-accent-color.helper'),
            key: 'site.accentColor',
            required: true,
            component: {
              type: 'color',
              supportsOpacity: false,
            },
            icon: 'palette',
          },
        ],
      },
      {
        type: 'section',
        id: 'site-social',
        title: t('site.sections.social.title'),
        description: t('site.sections.social.description'),
        icon: 'share-2',
        children: [
          {
            type: 'group',
            id: 'site-social-group',
            title: t('site.sections.social.groups.channels.title'),
            description: t('site.sections.social.groups.channels.description'),
            icon: 'share-2',
            children: [
              {
                type: 'field',
                id: 'site-social-twitter',
                title: t('site.sections.social.groups.channels.fields.twitter.title'),
                helperText: t('site.sections.social.groups.channels.fields.twitter.helper'),
                key: 'site.social.twitter',
                component: {
                  type: 'text',
                  autoCapitalize: 'none',
                  autoCorrect: false,
                  placeholder: 'https://twitter.com/username',
                },
                icon: 'twitter',
              },
              {
                type: 'field',
                id: 'site-social-github',
                title: t('site.sections.social.groups.channels.fields.github.title'),
                helperText: t('site.sections.social.groups.channels.fields.github.helper'),
                key: 'site.social.github',
                component: {
                  type: 'text',
                  autoCapitalize: 'none',
                  autoCorrect: false,
                  placeholder: 'https://github.com/username',
                },
                icon: 'github',
              },
            ],
          },
        ],
      },
      {
        type: 'section',
        id: 'site-feed',
        title: t('site.sections.feed.title'),
        description: t('site.sections.feed.description'),
        icon: 'radio',
        children: [
          {
            type: 'group',
            id: 'site-feed-folo',
            title: t('site.sections.feed.groups.folo.title'),
            description: t('site.sections.feed.groups.folo.description'),
            icon: 'goal',
            children: [
              {
                type: 'field',
                id: 'site-feed-folo-feed-id',
                title: t('site.sections.feed.groups.folo.fields.feed-id.title'),
                key: 'site.feed.folo.challenge.feedId',
                component: {
                  type: 'text',
                  autoCapitalize: 'none',
                  autoCorrect: false,
                  placeholder: t('site.sections.feed.groups.folo.fields.feed-id.placeholder'),
                },
                icon: 'hash',
              },
              {
                type: 'field',
                id: 'site-feed-folo-user-id',
                title: t('site.sections.feed.groups.folo.fields.user-id.title'),
                key: 'site.feed.folo.challenge.userId',
                component: {
                  type: 'text',
                  autoCapitalize: 'none',
                  autoCorrect: false,
                  placeholder: t('site.sections.feed.groups.folo.fields.user-id.placeholder'),
                },
                icon: 'user',
              },
            ],
          },
        ],
      },
      {
        type: 'section',
        id: 'site-viewer',
        title: t('site.sections.viewer.title'),
        description: t('site.sections.viewer.description'),
        icon: 'scan',
        children: [
          {
            type: 'field',
            id: 'site-viewer-region-label-placement',
            title: t('site.sections.viewer.fields.region-label-placement.title'),
            description: t('site.sections.viewer.fields.region-label-placement.description'),
            key: 'site.viewer.regions.labelPlacement',
            component: {
              type: 'select',
              options: ['edge', 'floating'],
              presentation: 'segmented',
            },
            icon: 'tag',
          },
        ],
      },
      {
        type: 'section',
        id: 'site-map',
        title: t('site.sections.map.title'),
        description: t('site.sections.map.description'),
        icon: 'map',
        children: [
          {
            type: 'field',
            id: 'site-map-providers',
            title: t('site.sections.map.fields.providers.title'),
            description: t('site.sections.map.fields.providers.description'),
            helperText: t('site.sections.map.fields.providers.helper'),
            key: 'site.map.providers',
            component: {
              type: 'multiSelect',
              options: ['maplibre'],
            },
            icon: 'list',
          },
          {
            type: 'field',
            id: 'site-map-style',
            title: t('site.sections.map.fields.style.title'),
            description: t('site.sections.map.fields.style.description'),
            helperText: t('site.sections.map.fields.style.helper'),
            key: 'site.mapStyle',
            component: {
              type: 'text',
              autoCapitalize: 'none',
              autoCorrect: false,
              placeholder: 'builtin',
            },
            icon: 'paintbrush',
          },
          {
            type: 'field',
            id: 'site-map-projection',
            title: t('site.sections.map.fields.projection.title'),
            description: t('site.sections.map.fields.projection.description'),
            helperText: t('site.sections.map.fields.projection.helper'),
            key: 'site.mapProjection',
            component: {
              type: 'select',
              placeholder: t('site.sections.map.fields.projection.placeholder'),
              options: ['mercator', 'globe'],
              presentation: 'segmented',
            },
            icon: 'compass',
          },
        ],
      },
    ],
  }
}

const SITE_SETTING_SCHEMA_FOR_KEYS = createSiteSettingUiSchema(identityUiSchemaT)

function collectKeys(nodes: ReadonlyArray<UiNode<SiteSettingKey>>): SiteSettingKey[] {
  const keys: SiteSettingKey[] = []

  for (const node of nodes) {
    if (node.type === 'field') {
      keys.push(node.key)
      continue
    }

    keys.push(...collectKeys(node.children))
  }

  return keys
}

export const SITE_SETTING_UI_SCHEMA_KEYS = Array.from(
  new Set(collectKeys(SITE_SETTING_SCHEMA_FOR_KEYS.sections)),
) as SiteSettingKey[]
