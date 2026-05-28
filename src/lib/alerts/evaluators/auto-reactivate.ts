import { and, eq, sql } from 'drizzle-orm'
import { campaigns, campaignSettings } from '../../../db/schema'
import type { Database } from '../../../db/client'

export type AutoReactivateResult = { scanned: number; reactivated: number }

// Returns the date in VN timezone (UTC+7) as YYYY-MM-DD.
// Same logic as low-users.ts todayVN().
function todayVN(): string {
  const now = Date.now()
  const vn = new Date(now + 7 * 60 * 60 * 1000)
  return vn.toISOString().slice(0, 10)
}

// Scans paused campaigns with auto_reactivate_next_day=true that were paused
// before today_VN, and reactivates them to status='active'.
// Idempotent: re-runs same day produce 0 reactivations after first run.
export async function runAutoReactivate(db: Database): Promise<AutoReactivateResult> {
  const today = todayVN()

  const candidates = await db.select({
    id: campaigns.id,
  })
    .from(campaigns)
    .innerJoin(campaignSettings, eq(campaignSettings.campaignId, campaigns.id))
    .where(and(
      eq(campaigns.status, 'paused'),
      eq(campaignSettings.autoReactivateNextDay, true),
      sql`date(${campaigns.updatedAt}) < ${today}`,
    ))

  let reactivated = 0
  for (const c of candidates) {
    // Race-safe: only reactivate if still paused.
    await db.update(campaigns)
      .set({ status: 'active', updatedAt: sql`(datetime('now'))` })
      .where(and(
        eq(campaigns.id, c.id),
        eq(campaigns.status, 'paused'),
      ))
    reactivated++
  }

  return { scanned: candidates.length, reactivated }
}
