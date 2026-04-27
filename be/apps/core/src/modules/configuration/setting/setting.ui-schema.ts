import type { UiSchemaTFunction } from '@core/modules/ui/ui-schema/ui-schema.i18n'
import { identityUiSchemaT } from '@core/modules/ui/ui-schema/ui-schema.i18n'
import type { UiNode } from '@core/modules/ui/ui-schema/ui-schema.type'

import type { SettingKeyType, SettingUiSchema } from './setting.type'

export const SETTING_UI_SCHEMA_VERSION = '1.3.0'

export function createSettingUiSchema(t: UiSchemaTFunction): SettingUiSchema {
  return {
    version: SETTING_UI_SCHEMA_VERSION,
    title: t('settings.title'),
    description: t('settings.description'),
    sections: [],
  }
}

const SETTING_SCHEMA_FOR_KEYS = createSettingUiSchema(identityUiSchemaT)

function collectKeys(nodes: ReadonlyArray<UiNode<SettingKeyType>>): SettingKeyType[] {
  const keys: SettingKeyType[] = []

  for (const node of nodes) {
    if (node.type === 'field') {
      keys.push(node.key)
      continue
    }

    keys.push(...collectKeys(node.children))
  }

  return keys
}

export const SETTING_UI_SCHEMA_KEYS = Array.from(
  new Set(collectKeys(SETTING_SCHEMA_FOR_KEYS.sections)),
) as SettingKeyType[]
