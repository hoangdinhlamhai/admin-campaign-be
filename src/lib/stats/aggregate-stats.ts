import { and, gte, lte, sql } from 'drizzle-orm'
import { campaignDailyStats, campaignAdDailyStats } from '../../db/schema'
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

export async function aggregateStats(db: Database, range: DateRange): Promise<AggregatedStats> {
  const dailyRow = await db
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

  const adRow = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${campaignAdDailyStats.cost}), 0)`,
      totalClicks: sql<number>`coalesce(sum(${campaignAdDailyStats.clicks}), 0)`,
    })
    .from(campaignAdDailyStats)
    .where(and(
      gte(campaignAdDailyStats.statDate, range.from),
      lte(campaignAdDailyStats.statDate, range.to),
    ))
    .get()

  const totalCompleted = dailyRow?.totalCompleted ?? 0
  const totalDisplays = dailyRow?.totalDisplays ?? 0
  const totalCost = adRow?.totalCost ?? 0
  const totalClicks = adRow?.totalClicks ?? 0

  const cpa = totalCompleted > 0 ? Math.round(totalCost / totalCompleted) : 0
  const conversionRate = totalClicks > 0
    ? Math.round((totalCompleted / totalClicks) * 10000) / 100
    : totalDisplays > 0
      ? Math.round((totalCompleted / totalDisplays) * 10000) / 100
      : 0

  return {
    totalTarget: dailyRow?.totalTarget ?? 0,
    totalCompleted,
    totalMissing: dailyRow?.totalMissing ?? 0,
    totalDisplays,
    totalWrong: dailyRow?.totalWrong ?? 0,
    totalValid: dailyRow?.totalValid ?? 0,
    totalCost,
    totalClicks,
    cpa,
    conversionRate,
  }
}
