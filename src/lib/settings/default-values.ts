export const GLOBAL_SETTING_KEYS = [
  'notify_low_users',
  'low_users_threshold',
  'notify_campaign_paused',
  'auto_reactivate_next_day',
  'limit_wrong_pass',
  'max_wrong_pass_attempts',
  'pause_on_no_valid_entry',
  'no_valid_entry_displays',
] as const

export type GlobalSettingKey = (typeof GLOBAL_SETTING_KEYS)[number]

export const GLOBAL_SETTING_DEFAULTS: Record<GlobalSettingKey, boolean | number> = {
  notify_low_users: false,
  low_users_threshold: 5,
  notify_campaign_paused: true,
  auto_reactivate_next_day: false,
  limit_wrong_pass: true,
  max_wrong_pass_attempts: 3,
  pause_on_no_valid_entry: true,
  no_valid_entry_displays: 5,
}
