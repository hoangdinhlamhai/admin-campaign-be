import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { campaigns, campaignDailyStats } from '../../db/schema'
import type { Database } from '../../db/client'
import type { DateRange } from './range-helpers'
import { rangeDays } from './range-helpers'

export type CampaignSummary = {
  from: string
  to: string
  totalUserTarget: number
  totalCompleted: number
  totalMissing: number
  pausedCount: number
  totalWrongEntries: number
}

export async function getCampaignSummary(
  db: Database,
  range: DateRange,
): Promise<CampaignSummary> {
  const days = rangeDays(range)

  // Query 1: campaign-level aggregates (non-archived only)
  const campaignAgg = await db
    .select({
      totalUserTarget: sql<number>`coalesce(sum(${campaigns.dailyUserTarget}), 0)`,
      pausedCount: sql<number>`coalesce(sum(case when ${campaigns.status} = 'paused' then 1 else 0 end), 0)`,
    })
    .from(campaigns)
    .where(ne(campaigns.status, 'archived'))
    .get()

  const totalUserTarget = campaignAgg?.totalUserTarget ?? 0
  const pausedCount = campaignAgg?.pausedCount ?? 0

  // Query 2: daily stats aggregates per campaign in range, for non-archived campaigns
  const statsAgg = await db
    .select({
      campaignId: campaignDailyStats.campaignId,
      completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      wrong: sql<number>`coalesce(sum(${campaignDailyStats.wrongEntryCount}), 0)`,
    })
    .from(campaignDailyStats)
    .where(and(
      gte(campaignDailyStats.statDate, range.from),
      lte(campaignDailyStats.statDate, range.to),
    ))
    .groupBy(campaignDailyStats.campaignId)

  // Build a map of completed counts per campaign from daily stats
  const completedMap = new Map<string, number>()
  let totalCompleted = 0
  let totalWrongEntries = 0

  for (const row of statsAgg) {
    completedMap.set(row.campaignId, row.completed)
    totalCompleted += row.completed
    totalWrongEntries += row.wrong
  }

  // Query 3: get each non-archived campaign's dailyUserTarget for missing calc
  const campaignTargets = await db
    .select({
      id: campaigns.id,
      dailyUserTarget: campaigns.dailyUserTarget,
    })
    .from(campaigns)
    .where(ne(campaigns.status, 'archived'))

  // Calculate totalMissing: for each campaign, max(target*days - completed, 0)
  let totalMissing = 0
  for (const camp of campaignTargets) {
    const target = (camp.dailyUserTarget ?? 0) * days
    const completed = completedMap.get(camp.id) ?? 0
    totalMissing += Math.max(target - completed, 0)
  }

  return {
    from: range.from,
    to: range.to,
    totalUserTarget,
    totalCompleted,
    totalMissing,
    pausedCount,
    totalWrongEntries,
  }
}
