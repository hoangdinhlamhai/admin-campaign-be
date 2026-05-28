import { and, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { campaigns, campaignDailyStats, parentCategories, childCategories } from '../../db/schema'
import type { DateRange } from './range-helpers'

export type CategoryScope = 'parent' | 'child'

export type CategoryStats = {
  totalCategoryCount: number
  totalCampaignCount: number
  pausedCampaignCount: number
  rangeTarget: number
  rangeCompleted: number
  rangeMissing: number
}

export async function loadCategoryStats(
  db: Database,
  scope: CategoryScope,
  range: DateRange,
): Promise<CategoryStats> {
  const dateFilter = and(
    gte(campaignDailyStats.statDate, range.from),
    lte(campaignDailyStats.statDate, range.to),
  )

  if (scope === 'parent') {
    const [catRow, campRow, pausedRow, dailyRow] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(parentCategories)
        .where(ne(parentCategories.status, 'archived'))
        .get(),
      db.select({ count: sql<number>`count(*)` }).from(campaigns).get(),
      db.select({ count: sql<number>`count(*)` })
        .from(campaigns)
        .where(eq(campaigns.status, 'paused'))
        .get(),
      db.select({
        target: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`,
        completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
        missing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
      }).from(campaignDailyStats).where(dateFilter).get(),
    ])
    return {
      totalCategoryCount: catRow?.count ?? 0,
      totalCampaignCount: campRow?.count ?? 0,
      pausedCampaignCount: pausedRow?.count ?? 0,
      rangeTarget: dailyRow?.target ?? 0,
      rangeCompleted: dailyRow?.completed ?? 0,
      rangeMissing: dailyRow?.missing ?? 0,
    }
  }

  // child scope
  const [catRow, campRow, pausedRow, dailyRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)` })
      .from(childCategories)
      .where(ne(childCategories.status, 'archived'))
      .get(),
    db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(isNotNull(campaigns.childCategoryId))
      .get(),
    db.select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(and(isNotNull(campaigns.childCategoryId), eq(campaigns.status, 'paused')))
      .get(),
    db.select({
      target: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`,
      completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      missing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
    })
      .from(campaignDailyStats)
      .innerJoin(campaigns, eq(campaigns.id, campaignDailyStats.campaignId))
      .where(and(dateFilter, isNotNull(campaigns.childCategoryId)))
      .get(),
  ])
  return {
    totalCategoryCount: catRow?.count ?? 0,
    totalCampaignCount: campRow?.count ?? 0,
    pausedCampaignCount: pausedRow?.count ?? 0,
    rangeTarget: dailyRow?.target ?? 0,
    rangeCompleted: dailyRow?.completed ?? 0,
    rangeMissing: dailyRow?.missing ?? 0,
  }
}
