import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { campaigns, campaignDailyStats, parentCategories, childCategories } from '../../db/schema'

export type CategoryScope = 'parent' | 'child'

export type CategoryStats = {
  totalCategoryCount: number
  totalCampaignCount: number
  pausedCampaignCount: number
  todayTarget: number
  todayCompleted: number
  todayMissing: number
}

export async function loadCategoryStats(
  db: Database,
  scope: CategoryScope,
  today: string,
): Promise<CategoryStats> {
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
      }).from(campaignDailyStats).where(eq(campaignDailyStats.statDate, today)).get(),
    ])
    return {
      totalCategoryCount: catRow?.count ?? 0,
      totalCampaignCount: campRow?.count ?? 0,
      pausedCampaignCount: pausedRow?.count ?? 0,
      todayTarget: dailyRow?.target ?? 0,
      todayCompleted: dailyRow?.completed ?? 0,
      todayMissing: dailyRow?.missing ?? 0,
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
      .where(and(eq(campaignDailyStats.statDate, today), isNotNull(campaigns.childCategoryId)))
      .get(),
  ])
  return {
    totalCategoryCount: catRow?.count ?? 0,
    totalCampaignCount: campRow?.count ?? 0,
    pausedCampaignCount: pausedRow?.count ?? 0,
    todayTarget: dailyRow?.target ?? 0,
    todayCompleted: dailyRow?.completed ?? 0,
    todayMissing: dailyRow?.missing ?? 0,
  }
}
