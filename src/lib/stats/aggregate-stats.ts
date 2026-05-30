import { and, eq, sql } from 'drizzle-orm'
import { campaignAdDailyStats, lockSessions, lockEvents } from '../../db/schema'
import type { Database } from '../../db/client'
import type { DateRange } from './range-helpers'

export type AggregatedStats = {
  totalTarget: number
  totalCompleted: number
  totalMissing: number
  totalDisplays: number
  totalWrong: number
  totalValid: number
  totalCost: number
  totalClicks: number
  cpa: number
  conversionRate: number
}

// Aggregates organic metrics from lock_events (single source of truth) for the
// given date range. Ad cost/clicks remain sourced from campaign_ad_daily_stats
// (Google Ads sync — currently empty so values stay 0 → FE renders "—").
//
// conversionRate = unlocked / lock_displayed (organic-only conversion).
export async function aggregateStats(db: Database, range: DateRange): Promise<AggregatedStats> {
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  const eventCounts = await db
    .select({
      eventType: lockEvents.eventType,
      n: sql<number>`count(*)`,
    })
    .from(lockEvents)
    .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
    .where(and(
      sql`${lockSessions.startedAt} >= ${fromMs}`,
      sql`${lockSessions.startedAt} < ${toMs}`,
    ))
    .groupBy(lockEvents.eventType)

  const counts = new Map<string, number>(eventCounts.map((r) => [r.eventType, r.n ?? 0]))
  const totalCompleted = counts.get('unlocked') ?? 0
  const totalDisplays = counts.get('lock_displayed') ?? 0
  const totalWrong = counts.get('pass_invalid') ?? 0
  const totalValid = counts.get('pass_valid') ?? 0

  const adRow = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${campaignAdDailyStats.cost}), 0)`,
      totalClicks: sql<number>`coalesce(sum(${campaignAdDailyStats.clicks}), 0)`,
    })
    .from(campaignAdDailyStats)
    .where(and(
      sql`${campaignAdDailyStats.statDate} >= ${range.from}`,
      sql`${campaignAdDailyStats.statDate} <= ${range.to}`,
    ))
    .get()

  const totalCost = adRow?.totalCost ?? 0
  const totalClicks = adRow?.totalClicks ?? 0

  // Organic conversion = unlocked / lock_displayed
  const conversionRate = totalDisplays > 0
    ? Math.round((totalCompleted / totalDisplays) * 10000) / 100
    : 0
  // CPA needs Ads cost; show 0 → FE renders "—"
  const cpa = totalCompleted > 0 && totalCost > 0 ? Math.round(totalCost / totalCompleted) : 0

  return {
    totalTarget: 0,
    totalCompleted,
    totalMissing: 0,
    totalDisplays,
    totalWrong,
    totalValid,
    totalCost,
    totalClicks,
    cpa,
    conversionRate,
  }
}
