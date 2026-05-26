import { Hono } from 'hono'
import { createDb } from '../db/client'
import { campaignDailyStats, categoryDailyStats, campaigns, parentCategories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const statsRoutes = new Hono<AppEnv>()

statsRoutes.use('*', authMiddleware)

// GET /api/stats/dashboard — overview stats for today
statsRoutes.get('/dashboard', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const today = new Date().toISOString().split('T')[0]

  // Campaign stats for today
  const campStats = await db
    .select({
      totalTarget: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`,
      totalCompleted: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      totalMissing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
      totalDisplays: sql<number>`coalesce(sum(${campaignDailyStats.displayCount}), 0)`,
      totalWrong: sql<number>`coalesce(sum(${campaignDailyStats.wrongEntryCount}), 0)`,
    })
    .from(campaignDailyStats)
    .where(eq(campaignDailyStats.statDate, today))
    .get()

  // Campaign counts by status
  const statusCounts = await db
    .select({
      status: campaigns.status,
      count: sql<number>`count(*)`,
    })
    .from(campaigns)
    .groupBy(campaigns.status)

  // Active parent categories count
  const catCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(parentCategories)
    .where(eq(parentCategories.status, 'active'))
    .get()

  return c.json({
    today,
    stats: campStats ?? { totalTarget: 0, totalCompleted: 0, totalMissing: 0, totalDisplays: 0, totalWrong: 0 },
    campaignsByStatus: statusCounts,
    activeCategoryCount: catCount?.count ?? 0,
  })
})

// GET /api/stats/campaigns/:id/daily — daily stats for a campaign
statsRoutes.get('/campaigns/:id/daily', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const campaignId = c.req.param('id')

  const result = await db
    .select()
    .from(campaignDailyStats)
    .where(eq(campaignDailyStats.campaignId, campaignId))
    .orderBy(campaignDailyStats.statDate)

  return c.json(result)
})
