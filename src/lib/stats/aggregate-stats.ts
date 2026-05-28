import { and, gte, lte, sql } from 'drizzle-orm'
import { campaignDailyStats } from '../../db/schema'
import type { Database } from '../../db/client'
import type { DateRange } from './range-helpers'

export type AggregatedStats = {
  totalTarget: number
  totalCompleted: number
  totalMissing: number
  totalDisplays: number
  totalWrong: number
  totalValid: number
  conversionRate: number
}

export async function aggregateStats(db: Database, range: DateRange): Promise<AggregatedStats> {
  const row = await db
    .select({
      totalTarget: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`,
      totalCompleted: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      totalMissing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
      totalDisplays: sql<number>`coalesce(sum(${campaignDailyStats.displayCount}), 0)`,
      totalWrong: sql<number>`coalesce(sum(${campaignDailyStats.wrongEntryCount}), 0)`,
      totalValid: sql<number>`coalesce(sum(${campaignDailyStats.validEntryCount}), 0)`,
    })
    .from(campaignDailyStats)
    .where(and(
      gte(campaignDailyStats.statDate, range.from),
      lte(campaignDailyStats.statDate, range.to),
    ))
    .get()

  const totalDisplays = row?.totalDisplays ?? 0
  const totalCompleted = row?.totalCompleted ?? 0
  const conversionRate = totalDisplays > 0
    ? Math.round((totalCompleted / totalDisplays) * 10000) / 100
    : 0

  return {
    totalTarget: row?.totalTarget ?? 0,
    totalCompleted,
    totalMissing: row?.totalMissing ?? 0,
    totalDisplays,
    totalWrong: row?.totalWrong ?? 0,
    totalValid: row?.totalValid ?? 0,
    conversionRate,
  }
}
