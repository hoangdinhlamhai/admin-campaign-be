export const GLOBAL_SETTING_KEYS = [
  'notify_target_reached',
  'notify_campaign_paused',
  'auto_reactivate_next_day',
  'limit_wrong_pass',
  'max_wrong_pass_attempts',
  'pause_on_no_valid_entry',
  'no_valid_entry_displays',
] as const

export type GlobalSettingKey = (typeof GLOBAL_SETTING_KEYS)[number]

export const GLOBAL_SETTING_DEFAULTS: Record<GlobalSettingKey, boolean | number> = {
  notify_target_reached: true,
  notify_campaign_paused: true,
  auto_reactivate_next_day: false,
  limit_wrong_pass: true,
  max_wrong_pass_attempts: 3,
  pause_on_no_valid_entry: true,
  no_valid_entry_displays: 5,
}
