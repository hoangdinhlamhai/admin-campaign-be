import { Hono } from 'hono'
import { createDb } from '../db/client'
import { campaignAdDailyStats, campaigns, parentCategories, childCategories, lockSessions, lockEvents, campaignDailyStats } from '../db/schema'
import { and, eq, gte, lte, like, or, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { parseDateRange, rangeDays } from '../lib/stats/range-helpers'
import { aggregateStats } from '../lib/stats/aggregate-stats'
import { getCampaignSummary } from '../lib/stats/campaign-summary'
import { loadCategoryStats, type CategoryScope } from '../lib/stats/category-stats'
import type { AppEnv } from '../lib/types'

export const statsRoutes = new Hono<AppEnv>()

statsRoutes.use('*', authMiddleware)

// GET /api/stats/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
statsRoutes.get('/dashboard', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))

  const stats = await aggregateStats(db, range)

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

  // Total paused campaigns
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
    categoryStats = await loadCategoryStats(db, categoryScopeParam as CategoryScope, range)
  }

  return c.json({
    from: range.from,
    to: range.to,
    stats,
    campaignsByStatus: statusCounts,
    activeCategoryCount: catCount?.count ?? 0,
    totalPausedCampaigns,
    ...(categoryStats ? { categoryStats } : {}),
  })
})

// GET /api/stats/campaigns-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
statsRoutes.get('/campaigns-summary', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))

  const summary = await getCampaignSummary(db, range)

  return c.json(summary)
})

// GET /api/stats/overview-table?from=YYYY-MM-DD&to=YYYY-MM-DD&q=&parentId=&childId=
statsRoutes.get('/overview-table', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))
  const days = rangeDays(range)
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  const q = c.req.query('q')?.trim()
  const parentId = c.req.query('parentId')
  const childId = c.req.query('childId')

  const conditions: ReturnType<typeof eq>[] = []
  if (parentId) conditions.push(eq(campaigns.parentCategoryId, parentId))
  if (childId) conditions.push(eq(campaigns.childCategoryId, childId))
  if (q) {
    conditions.push(or(
      like(campaigns.name, `%${q}%`),
      like(campaigns.code, `%${q}%`),
    )!)
  }

  // Subquery: ad cost/clicks per campaign within date range
  const adAgg = db
    .select({
      campaignId: campaignAdDailyStats.campaignId,
      adCost: sql<number>`coalesce(sum(${campaignAdDailyStats.cost}), 0)`.as('ad_cost'),
      adClicks: sql<number>`coalesce(sum(${campaignAdDailyStats.clicks}), 0)`.as('ad_clicks'),
    })
    .from(campaignAdDailyStats)
    .where(and(
      gte(campaignAdDailyStats.statDate, range.from),
      lte(campaignAdDailyStats.statDate, range.to),
    ))
    .groupBy(campaignAdDailyStats.campaignId)
    .as('ad_agg')

  // Subquery: organic event counts per campaign from lock_events
  const lockAgg = db
    .select({
      campaignId: lockSessions.campaignId,
      displays: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'lock_displayed' then 1 else 0 end), 0)`.as('lock_displays'),
      completed: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'unlocked' then 1 else 0 end), 0)`.as('lock_completed'),
      valid: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'pass_valid' then 1 else 0 end), 0)`.as('lock_valid'),
      wrong: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'pass_invalid' then 1 else 0 end), 0)`.as('lock_wrong'),
    })
    .from(lockSessions)
    .innerJoin(lockEvents, eq(lockEvents.sessionId, lockSessions.id))
    .where(and(
      sql`${lockSessions.startedAt} >= ${fromMs}`,
      sql`${lockSessions.startedAt} < ${toMs}`,
    ))
    .groupBy(lockSessions.campaignId)
    .as('lock_agg')

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
      displays: lockAgg.displays,
      valid: lockAgg.valid,
      wrong: lockAgg.wrong,
      completed: lockAgg.completed,
      cost: adAgg.adCost,
      clicks: adAgg.adClicks,
    })
    .from(campaigns)
    .leftJoin(parentCategories, eq(parentCategories.id, campaigns.parentCategoryId))
    .leftJoin(childCategories, eq(childCategories.id, campaigns.childCategoryId))
    .leftJoin(adAgg, eq(adAgg.campaignId, campaigns.id))
    .leftJoin(lockAgg, eq(lockAgg.campaignId, campaigns.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  const items = rows.map((r) => {
    const target = (r.dailyUserTarget ?? 0) * days
    const displays = r.displays ?? 0
    const completed = r.completed ?? 0
    const cost = r.cost ?? 0
    const clicks = r.clicks ?? 0

    // Organic conversion only — Ads click conversion needs Google Ads sync
    const conversionRate = displays > 0
      ? Math.round((completed / displays) * 10000) / 100
      : 0

    const cpa = completed > 0 && cost > 0 ? Math.round(cost / completed) : null
    const missing = Math.max(0, target - completed)

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
      missing,
      conversionRate,
      cost: cost > 0 ? cost : null,
      clicks: clicks > 0 ? clicks : null,
      cpa,
      source: null,
    }
  })

  return c.json({
    from: range.from,
    to: range.to,
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
