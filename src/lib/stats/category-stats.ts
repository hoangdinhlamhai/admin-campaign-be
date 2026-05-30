import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { campaigns, lockSessions, lockEvents, parentCategories, childCategories } from '../../db/schema'
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
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  if (scope === 'parent') {
    const [catRow, campRow, pausedRow, targetRow, completedRow] = await Promise.all([
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
        target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`,
      }).from(campaigns).get(),
      db.select({ completed: sql<number>`coalesce(count(*), 0)` })
        .from(lockEvents)
        .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
        .where(and(
          eq(lockEvents.eventType, 'unlocked'),
          sql`${lockSessions.startedAt} >= ${fromMs}`,
          sql`${lockSessions.startedAt} < ${toMs}`,
        ))
        .get(),
    ])
    const rangeTarget = targetRow?.target ?? 0
    const rangeCompleted = completedRow?.completed ?? 0
    return {
      totalCategoryCount: catRow?.count ?? 0,
      totalCampaignCount: campRow?.count ?? 0,
      pausedCampaignCount: pausedRow?.count ?? 0,
      rangeTarget,
      rangeCompleted,
      rangeMissing: Math.max(0, rangeTarget - rangeCompleted),
    }
  }

  // child scope: only campaigns linked to a child category
  const [catRow, campRow, pausedRow, targetRow, completedRow] = await Promise.all([
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
      target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`,
    })
      .from(campaigns)
      .where(isNotNull(campaigns.childCategoryId))
      .get(),
    db.select({ completed: sql<number>`coalesce(count(*), 0)` })
      .from(lockEvents)
      .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
      .innerJoin(campaigns, eq(campaigns.id, lockSessions.campaignId))
      .where(and(
        isNotNull(campaigns.childCategoryId),
        eq(lockEvents.eventType, 'unlocked'),
        sql`${lockSessions.startedAt} >= ${fromMs}`,
        sql`${lockSessions.startedAt} < ${toMs}`,
      ))
      .get(),
  ])
  const rangeTarget = targetRow?.target ?? 0
  const rangeCompleted = completedRow?.completed ?? 0
  return {
    totalCategoryCount: catRow?.count ?? 0,
    totalCampaignCount: campRow?.count ?? 0,
    pausedCampaignCount: pausedRow?.count ?? 0,
    rangeTarget,
    rangeCompleted,
    rangeMissing: Math.max(0, rangeTarget - rangeCompleted),
  }
}
