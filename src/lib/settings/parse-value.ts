import { GLOBAL_SETTING_DEFAULTS, type GlobalSettingKey } from './default-values'

export function serializeValue(v: boolean | number): string {
  return JSON.stringify(v)
}

export function parseValue(key: GlobalSettingKey, raw: string | null): boolean | number {
  if (raw == null) return GLOBAL_SETTING_DEFAULTS[key]
  try {
    return JSON.parse(raw)
  } catch {
    return GLOBAL_SETTING_DEFAULTS[key]
  }
}

export function validateValue(key: GlobalSettingKey, value: unknown): boolean {
  return typeof value === typeof GLOBAL_SETTING_DEFAULTS[key]
}
