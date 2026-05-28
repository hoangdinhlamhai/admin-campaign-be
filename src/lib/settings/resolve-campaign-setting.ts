import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { campaignSettings } from '../../db/schema'
import { loadGlobalSettings, type GlobalSettingsMap } from './load-global-settings'
import { GLOBAL_SETTING_DEFAULTS } from './default-values'

export type EffectiveSettings = {
  notifyLowUsers: boolean
  lowUsersThreshold: number
  notifyCampaignPaused: boolean
  autoReactivateNextDay: boolean
  limitWrongPass: boolean
  maxWrongPassAttempts: number
  pauseOnNoValidEntry: boolean
  noValidEntryDisplays: number
}

export async function resolveCampaignSettings(
  db: Database,
  campaignId: string,
  globalsCache?: GlobalSettingsMap,
): Promise<EffectiveSettings> {
  const globals = globalsCache ?? await loadGlobalSettings(db)
  const cs = await db.select().from(campaignSettings)
    .where(eq(campaignSettings.campaignId, campaignId)).get()

  return {
    notifyLowUsers: cs?.notifyLowUsers ?? globals.notify_low_users as boolean ?? GLOBAL_SETTING_DEFAULTS.notify_low_users as boolean,
    lowUsersThreshold: cs?.lowUsersThreshold ?? globals.low_users_threshold as number ?? GLOBAL_SETTING_DEFAULTS.low_users_threshold as number,
    notifyCampaignPaused: cs?.notifyCampaignPaused ?? globals.notify_campaign_paused as boolean ?? GLOBAL_SETTING_DEFAULTS.notify_campaign_paused as boolean,
    autoReactivateNextDay: cs?.autoReactivateNextDay ?? globals.auto_reactivate_next_day as boolean ?? GLOBAL_SETTING_DEFAULTS.auto_reactivate_next_day as boolean,
    limitWrongPass: cs?.limitWrongPass ?? globals.limit_wrong_pass as boolean ?? GLOBAL_SETTING_DEFAULTS.limit_wrong_pass as boolean,
    maxWrongPassAttempts: cs?.maxWrongPassAttempts ?? globals.max_wrong_pass_attempts as number ?? GLOBAL_SETTING_DEFAULTS.max_wrong_pass_attempts as number,
    pauseOnNoValidEntry: cs?.pauseOnNoValidEntry ?? globals.pause_on_no_valid_entry as boolean ?? GLOBAL_SETTING_DEFAULTS.pause_on_no_valid_entry as boolean,
    noValidEntryDisplays: cs?.noValidEntryDisplays ?? globals.no_valid_entry_displays as number ?? GLOBAL_SETTING_DEFAULTS.no_valid_entry_displays as number,
  }
}
