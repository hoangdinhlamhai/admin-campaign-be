import { and, eq } from 'drizzle-orm'
import { campaigns, campaignDailyStats, campaignSettings } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'

// Fires when wrong_entry_count exceeds campaign.maxWrongAttempts for the day.
// Gated by campaign_settings.limit_wrong_pass — when off, evaluator is a no-op.
export async function evaluateWrongPass(db: Database, campaignId: string, date: string): Promise<void> {
  const row = await db.select({
    name: campaigns.name,
    max: campaigns.maxWrongAttempts,
    limitEnabled: campaignSettings.limitWrongPass,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
  })
    .from(campaigns)
    .innerJoin(campaignSettings, eq(campaignSettings.campaignId, campaigns.id))
    .where(eq(campaigns.id, campaignId))
    .get()

  if (!row?.limitEnabled || !row.max) return

  const stats = await db.select({ wrong: campaignDailyStats.wrongEntryCount })
    .from(campaignDailyStats)
    .where(and(
      eq(campaignDailyStats.campaignId, campaignId),
      eq(campaignDailyStats.statDate, date),
    )).get()

  const wrong = stats?.wrong ?? 0
  if (wrong > row.max) {
    await emitAlert(db, {
      campaignId,
      parentCategoryId: row.parentCategoryId,
      childCategoryId: row.childCategoryId,
      type: 'wrong_pass_exceeded',
      severity: 'warning',
      title: `Vượt ngưỡng sai mã: ${row.name}`,
      description: `Đã có ${wrong} lần nhập sai mã trong ngày (ngưỡng ${row.max}).`,
    })
  }
}
