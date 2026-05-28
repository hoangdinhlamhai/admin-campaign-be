import { and, eq } from 'drizzle-orm'
import { campaigns, campaignSettings, campaignDailyStats } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'

// Returns the date in VN timezone (UTC+7) as YYYY-MM-DD.
// Cron fires at 16:55 UTC = 23:55 VN, so today_VN = today_UTC + 7h.
function todayVN(): string {
  const now = Date.now()
  const vn = new Date(now + 7 * 60 * 60 * 1000)
  return vn.toISOString().slice(0, 10)
}

export type DailyEvaluatorResult = { scanned: number; emitted: number }

// Scans all active campaigns with notify_low_users=true and emits low_users alert
// when completedCount for the day is below lowUsersThreshold. Idempotent (dedup A).
export async function runDailyEvaluator(db: Database): Promise<DailyEvaluatorResult> {
  const today = todayVN()

  const rows = await db.select({
    campaignId: campaigns.id,
    campaignName: campaigns.name,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
    threshold: campaignSettings.lowUsersThreshold,
    completed: campaignDailyStats.completedCount,
  })
    .from(campaigns)
    .innerJoin(campaignSettings, eq(campaignSettings.campaignId, campaigns.id))
    .leftJoin(campaignDailyStats, and(
      eq(campaignDailyStats.campaignId, campaigns.id),
      eq(campaignDailyStats.statDate, today),
    ))
    .where(and(
      eq(campaigns.status, 'active'),
      eq(campaignSettings.notifyLowUsers, true),
    ))

  let emitted = 0
  for (const r of rows) {
    if (r.threshold == null || r.threshold <= 0) continue
    const completed = r.completed ?? 0
    if (completed < r.threshold) {
      const id = await emitAlert(db, {
        campaignId: r.campaignId,
        parentCategoryId: r.parentCategoryId,
        childCategoryId: r.childCategoryId,
        type: 'low_users',
        severity: 'warning',
        title: `Chưa đủ user mục tiêu: ${r.campaignName}`,
        description: `Hôm nay đạt ${completed}/${r.threshold} user.`,
      })
      if (id) emitted++
    }
  }

  return { scanned: rows.length, emitted }
}
