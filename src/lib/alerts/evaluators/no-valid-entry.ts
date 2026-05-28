import { and, eq, sql } from 'drizzle-orm'
import { campaigns, campaignDailyStats, campaignSettings } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'
import { emitCampaignPausedAlert } from './campaign-paused'

// Fires when display_count >= settings.noValidEntryDisplays AND valid_entry_count = 0.
// Only active when settings.pauseOnNoValidEntry is enabled.
// Side effect: when triggered, also flips campaign status to 'paused' and emits
// campaign_paused alert (if notifyCampaignPaused is on).
export async function evaluateNoValidEntry(db: Database, campaignId: string, date: string): Promise<void> {
  const settings = await db.select().from(campaignSettings)
    .where(eq(campaignSettings.campaignId, campaignId))
    .get()
  if (!settings?.pauseOnNoValidEntry || !settings.noValidEntryDisplays) return

  const stats = await db.select({
    displayCount: campaignDailyStats.displayCount,
    validEntryCount: campaignDailyStats.validEntryCount,
  })
    .from(campaignDailyStats)
    .where(and(
      eq(campaignDailyStats.campaignId, campaignId),
      eq(campaignDailyStats.statDate, date),
    )).get()
  if (!stats) return

  const displays = stats.displayCount ?? 0
  const valids = stats.validEntryCount ?? 0
  if (displays < settings.noValidEntryDisplays || valids !== 0) return

  const camp = await db.select({
    name: campaigns.name,
    status: campaigns.status,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
  }).from(campaigns).where(eq(campaigns.id, campaignId)).get()

  await emitAlert(db, {
    campaignId,
    parentCategoryId: camp?.parentCategoryId ?? null,
    childCategoryId: camp?.childCategoryId ?? null,
    type: 'no_valid_entry',
    severity: 'danger',
    title: `Không có entry hợp lệ: ${camp?.name ?? campaignId}`,
    description: `Đã hiển thị ${displays} lần nhưng chưa có lượt hợp lệ nào.`,
  })

  // Auto-pause: idempotent via WHERE status='active'.
  if (camp?.status === 'active') {
    await db.update(campaigns)
      .set({ status: 'paused', updatedAt: sql`(datetime('now'))` })
      .where(and(
        eq(campaigns.id, campaignId),
        eq(campaigns.status, 'active'),
      ))

    await emitCampaignPausedAlert(db, campaignId, 'no_valid_entry')
  }
}
