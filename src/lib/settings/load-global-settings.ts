import type { Database } from '../../db/client'
import { globalSettings } from '../../db/schema'
import { GLOBAL_SETTING_KEYS, GLOBAL_SETTING_DEFAULTS, type GlobalSettingKey } from './default-values'
import { parseValue } from './parse-value'

export type GlobalSettingsMap = Record<GlobalSettingKey, boolean | number>

export async function loadGlobalSettings(db: Database): Promise<GlobalSettingsMap> {
  const rows = await db.select().from(globalSettings)
  const map = { ...GLOBAL_SETTING_DEFAULTS } as GlobalSettingsMap
  for (const row of rows) {
    if ((GLOBAL_SETTING_KEYS as readonly string[]).includes(row.key)) {
      ;(map as Record<string, boolean | number>)[row.key] = parseValue(row.key as GlobalSettingKey, row.value)
    }
  }
  return map
}
