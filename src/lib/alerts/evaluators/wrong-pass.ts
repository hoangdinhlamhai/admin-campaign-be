import { and, eq } from 'drizzle-orm'
import { campaigns, campaignDailyStats } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'
import { resolveCampaignSettings } from '../../settings/resolve-campaign-setting'
import type { GlobalSettingsMap } from '../../settings/load-global-settings'

// Fires when wrong_entry_count exceeds maxWrongPassAttempts for the day.
// Gated by effective setting `limitWrongPass` — when off, evaluator is a no-op.
export async function evaluateWrongPass(
  db: Database,
  campaignId: string,
  date: string,
  globalsCache?: GlobalSettingsMap,
): Promise<void> {
  const settings = await resolveCampaignSettings(db, campaignId, globalsCache)
  if (!settings.limitWrongPass || !settings.maxWrongPassAttempts) return

  const camp = await db.select({
    name: campaigns.name,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
  })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get()
  if (!camp) return

  const stats = await db.select({ wrong: campaignDailyStats.wrongEntryCount })
    .from(campaignDailyStats)
    .where(and(
      eq(campaignDailyStats.campaignId, campaignId),
      eq(campaignDailyStats.statDate, date),
    )).get()

  const wrong = stats?.wrong ?? 0
  if (wrong > settings.maxWrongPassAttempts) {
    await emitAlert(db, {
      campaignId,
      parentCategoryId: camp.parentCategoryId,
      childCategoryId: camp.childCategoryId,
      type: 'wrong_pass_exceeded',
      severity: 'warning',
      title: `Vượt ngưỡng sai mã: ${camp.name}`,
      description: `Đã có ${wrong} lần nhập sai mã trong ngày (ngưỡng ${settings.maxWrongPassAttempts}).`,
    })
  }
}
