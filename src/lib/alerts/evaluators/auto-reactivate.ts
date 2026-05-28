import { and, eq, sql } from 'drizzle-orm'
import { campaigns } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { resolveCampaignSettings } from '../../settings/resolve-campaign-setting'
import { loadGlobalSettings } from '../../settings/load-global-settings'

export type AutoReactivateResult = { scanned: number; reactivated: number }

// Returns the date in VN timezone (UTC+7) as YYYY-MM-DD.
function todayVN(): string {
  const now = Date.now()
  const vn = new Date(now + 7 * 60 * 60 * 1000)
  return vn.toISOString().slice(0, 10)
}

// Scans paused campaigns and reactivates those with effective
// autoReactivateNextDay=true that were paused before today_VN.
// Idempotent: re-runs same day produce 0 reactivations after first run.
export async function runAutoReactivate(db: Database): Promise<AutoReactivateResult> {
  const today = todayVN()
  const globalsCache = await loadGlobalSettings(db)

  // Get all paused campaigns that were updated before today
  const candidates = await db.select({
    id: campaigns.id,
  })
    .from(campaigns)
    .where(and(
      eq(campaigns.status, 'paused'),
      sql`date(${campaigns.updatedAt}) < ${today}`,
    ))

  let reactivated = 0
  for (const c of candidates) {
    const settings = await resolveCampaignSettings(db, c.id, globalsCache)
    if (!settings.autoReactivateNextDay) continue

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
