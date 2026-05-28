import { Hono } from 'hono'
import { createDb } from '../db/client'
import { campaignDailyStats, campaigns, parentCategories, childCategories } from '../db/schema'
import { and, eq, gte, lte, like, or, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { parseRange, rangeWindow, previousWindow, rangeDays } from '../lib/stats/range-helpers'
import { aggregateStats } from '../lib/stats/aggregate-stats'
import { loadCategoryStats, type CategoryScope } from '../lib/stats/category-stats'
import type { AppEnv } from '../lib/types'

export const statsRoutes = new Hono<AppEnv>()

statsRoutes.use('*', authMiddleware)

// GET /api/stats/dashboard?range=today|7d|30d — overview stats with previous period
statsRoutes.get('/dashboard', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const rangeKey = parseRange(c.req.query('range'))
  const curr = rangeWindow(rangeKey)
  const prev = previousWindow(curr)

  const [stats, prevStats] = await Promise.all([
    aggregateStats(db, curr),
    aggregateStats(db, prev),
  ])

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

  // Total paused campaigns (always included)
  const pausedCampaignsRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(campaigns)
    .where(eq(campaigns.status, 'paused'))
    .get()
  const totalPausedCampaigns = pausedCampaignsRow?.count ?? 0

  // Category-scoped stats (only when categoryScope query param is set)
  const categoryScopeParam = c.req.query('categoryScope')
  let categoryStats: import('../lib/stats/category-stats').CategoryStats | undefined
  if (categoryScopeParam === 'parent' || categoryScopeParam === 'child') {
    const today = curr.to
    categoryStats = await loadCategoryStats(db, categoryScopeParam as CategoryScope, today)
  }

  return c.json({
    range: rangeKey,
    from: curr.from,
    to: curr.to,
    stats,
    previous: {
      from: prev.from,
      to: prev.to,
      stats: prevStats,
    },
    campaignsByStatus: statusCounts,
    activeCategoryCount: catCount?.count ?? 0,
    totalPausedCampaigns,
    ...(categoryStats ? { categoryStats } : {}),
  })
})

// GET /api/stats/overview-table?range=7d&q=&parentId=&childId=
statsRoutes.get('/overview-table', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const rangeKey = parseRange(c.req.query('range'))
  const curr = rangeWindow(rangeKey)
  const days = rangeDays(curr)

  const q = c.req.query('q')?.trim()
  const parentId = c.req.query('parentId')
  const childId = c.req.query('childId')

  // Build WHERE conditions
  const conditions = [
    gte(campaignDailyStats.statDate, curr.from),
    lte(campaignDailyStats.statDate, curr.to),
  ]

  if (parentId) {
    conditions.push(eq(campaigns.parentCategoryId, parentId))
  }
  if (childId) {
    conditions.push(eq(campaigns.childCategoryId, childId))
  }
  if (q) {
    conditions.push(or(
      like(campaigns.name, `%${q}%`),
      like(campaigns.code, `%${q}%`),
    )!)
  }

  const rows = await db
    .select({
      id: campaigns.id,
      code: campaigns.code,
      name: campaigns.name,
      parentCategoryId: campaigns.parentCategoryId,
      parentName: parentCategories.name,
      childCategoryId: campaigns.childCategoryId,
      childName: childCategories.name,
      status: campaigns.status,
      dailyUserTarget: campaigns.dailyUserTarget,
      displays: sql<number>`coalesce(sum(${campaignDailyStats.displayCount}), 0)`,
      valid: sql<number>`coalesce(sum(${campaignDailyStats.validEntryCount}), 0)`,
      wrong: sql<number>`coalesce(sum(${campaignDailyStats.wrongEntryCount}), 0)`,
      completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      missing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
    })
    .from(campaigns)
    .leftJoin(campaignDailyStats, and(
      eq(campaignDailyStats.campaignId, campaigns.id),
      gte(campaignDailyStats.statDate, curr.from),
      lte(campaignDailyStats.statDate, curr.to),
    ))
    .leftJoin(parentCategories, eq(parentCategories.id, campaigns.parentCategoryId))
    .leftJoin(childCategories, eq(childCategories.id, campaigns.childCategoryId))
    .where(and(...conditions))
    .groupBy(campaigns.id)

  const items = rows.map((r) => {
    const target = (r.dailyUserTarget ?? 0) * days
    const displays = r.displays ?? 0
    const completed = r.completed ?? 0
    const conversionRate = displays > 0
      ? Math.round((completed / displays) * 10000) / 100
      : 0

    return {
      id: r.id,
      code: r.code,
      name: r.name,
      parentCategoryId: r.parentCategoryId,
      parentName: r.parentName,
      childCategoryId: r.childCategoryId,
      childName: r.childName,
      status: r.status,
      target,
      displays,
      valid: r.valid ?? 0,
      wrong: r.wrong ?? 0,
      completed,
      missing: r.missing ?? 0,
      conversionRate,
      // Ad columns reserved for future Google Ads integration
      cost: null,
      clicks: null,
      cpa: null,
      source: null,
    }
  })

  return c.json({
    range: rangeKey,
    from: curr.from,
    to: curr.to,
    items,
    total: items.length,
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
