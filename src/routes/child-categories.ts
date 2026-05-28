import { Hono } from 'hono'
import { createDb } from '../db/client'
import { childCategories, parentCategories, campaigns, campaignDailyStats } from '../db/schema'
import { eq, sql, and, gte, lte } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { parseDateRange } from '../lib/stats/range-helpers'
import type { AppEnv } from '../lib/types'

export const childCategoryRoutes = new Hono<AppEnv>()

childCategoryRoutes.use('*', authMiddleware)

// GET /api/child-categories?parentId=&from=YYYY-MM-DD&to=YYYY-MM-DD
childCategoryRoutes.get('/', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const parentId = c.req.query('parentId')
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))

  // Subquery: campaign counts per child category
  const campaignCountSub = db
    .select({
      childId: campaigns.childCategoryId,
      total: sql<number>`count(*)`.as('camp_total'),
      paused: sql<number>`sum(case when ${campaigns.status} = 'paused' then 1 else 0 end)`.as('camp_paused'),
    })
    .from(campaigns)
    .groupBy(campaigns.childCategoryId)
    .as('campaign_count_sub')

  // Subquery: range stats from campaign_daily_stats via campaigns
  const rangeStatsSub = db
    .select({
      childId: campaigns.childCategoryId,
      target: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`.as('rs_target'),
      completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`.as('rs_completed'),
      missing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`.as('rs_missing'),
    })
    .from(campaigns)
    .innerJoin(
      campaignDailyStats,
      and(
        eq(campaignDailyStats.campaignId, campaigns.id),
        gte(campaignDailyStats.statDate, range.from),
        lte(campaignDailyStats.statDate, range.to)
      )
    )
    .groupBy(campaigns.childCategoryId)
    .as('range_stats_sub')

  // Main query
  const baseQuery = db
    .select({
      id: childCategories.id,
      parentId: childCategories.parentId,
      parentName: parentCategories.name,
      name: childCategories.name,
      website: childCategories.website,
      initials: childCategories.initials,
      slug: childCategories.slug,
      description: childCategories.description,
      dailyUserTarget: childCategories.dailyUserTarget,
      status: childCategories.status,
      createdAt: childCategories.createdAt,
      campaignCount: sql<number>`coalesce(${campaignCountSub.total}, 0)`,
      pausedCount: sql<number>`coalesce(${campaignCountSub.paused}, 0)`,
      rsTarget: sql<number>`coalesce(${rangeStatsSub.target}, 0)`,
      rsCompleted: sql<number>`coalesce(${rangeStatsSub.completed}, 0)`,
      rsMissing: sql<number>`coalesce(${rangeStatsSub.missing}, 0)`,
    })
    .from(childCategories)
    .leftJoin(parentCategories, eq(childCategories.parentId, parentCategories.id))
    .leftJoin(campaignCountSub, eq(campaignCountSub.childId, childCategories.id))
    .leftJoin(rangeStatsSub, eq(rangeStatsSub.childId, childCategories.id))

  const rows = parentId
    ? await baseQuery.where(eq(childCategories.parentId, parentId))
    : await baseQuery

  const result = rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    parentName: r.parentName,
    name: r.name,
    website: r.website,
    initials: r.initials,
    slug: r.slug,
    description: r.description,
    dailyUserTarget: r.dailyUserTarget,
    status: r.status,
    createdAt: r.createdAt,
    campaignCount: r.campaignCount ?? 0,
    pausedCount: r.pausedCount ?? 0,
    rangeStats: {
      target: r.rsTarget ?? 0,
      completed: r.rsCompleted ?? 0,
      missing: r.rsMissing ?? 0,
    },
  }))

  return c.json(result)
})

// GET /api/child-categories/:id?from=YYYY-MM-DD&to=YYYY-MM-DD
childCategoryRoutes.get('/:id', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))

  // Fetch child with parent name
  const childRow = await db
    .select({
      id: childCategories.id,
      parentId: childCategories.parentId,
      parentName: parentCategories.name,
      name: childCategories.name,
      website: childCategories.website,
      initials: childCategories.initials,
      slug: childCategories.slug,
      description: childCategories.description,
      dailyUserTarget: childCategories.dailyUserTarget,
      status: childCategories.status,
      createdAt: childCategories.createdAt,
    })
    .from(childCategories)
    .leftJoin(parentCategories, eq(parentCategories.id, childCategories.parentId))
    .where(eq(childCategories.id, id))
    .get()

  if (!childRow) return c.json({ error: 'Not found' }, 404)

  // Aggregate counts for this child
  const countRow = await db
    .select({
      total: sql<number>`count(*)`,
      paused: sql<number>`sum(case when ${campaigns.status} = 'paused' then 1 else 0 end)`,
    })
    .from(campaigns)
    .where(eq(campaigns.childCategoryId, id))
    .get()

  const campaignCount = countRow?.total ?? 0
  const pausedCount = countRow?.paused ?? 0

  // Range stats for this child (all campaigns under this child)
  const rangeRow = await db
    .select({
      target: sql<number>`coalesce(sum(${campaignDailyStats.dailyUserTarget}), 0)`,
      completed: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      missing: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
    })
    .from(campaigns)
    .innerJoin(
      campaignDailyStats,
      and(
        eq(campaignDailyStats.campaignId, campaigns.id),
        gte(campaignDailyStats.statDate, range.from),
        lte(campaignDailyStats.statDate, range.to)
      )
    )
    .where(eq(campaigns.childCategoryId, id))
    .get()

  // Campaigns breakdown: each campaign with aggregated stats in range
  const campaignRows = await db
    .select({
      id: campaigns.id,
      code: campaigns.code,
      name: campaigns.name,
      status: campaigns.status,
      dailyUserTarget: campaigns.dailyUserTarget,
      completedCount: sql<number>`coalesce(sum(${campaignDailyStats.completedCount}), 0)`,
      missingCount: sql<number>`coalesce(sum(${campaignDailyStats.missingCount}), 0)`,
      displayCount: sql<number>`coalesce(sum(${campaignDailyStats.displayCount}), 0)`,
    })
    .from(campaigns)
    .leftJoin(
      campaignDailyStats,
      and(
        eq(campaignDailyStats.campaignId, campaigns.id),
        gte(campaignDailyStats.statDate, range.from),
        lte(campaignDailyStats.statDate, range.to)
      )
    )
    .where(eq(campaigns.childCategoryId, id))
    .groupBy(campaigns.id)

  const campaignsList = campaignRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    dailyUserTarget: r.dailyUserTarget ?? 0,
    completedCount: r.completedCount ?? 0,
    missingCount: r.missingCount ?? 0,
    displayCount: r.displayCount ?? 0,
  }))

  return c.json({
    ...childRow,
    campaignCount,
    pausedCount,
    rangeStats: {
      target: rangeRow?.target ?? 0,
      completed: rangeRow?.completed ?? 0,
      missing: rangeRow?.missing ?? 0,
    },
    campaigns: campaignsList,
  })
})

// POST /api/child-categories
childCategoryRoutes.post('/', requirePermission('categories.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()

  // Validate parent exists
  const parent = await db.select().from(parentCategories).where(eq(parentCategories.id, body.parentId)).get()
  if (!parent) return c.json({ error: 'Parent category not found' }, 400)

  const userId = c.get('userId')

  await db.insert(childCategories).values({
    id,
    parentId: body.parentId,
    name: body.name,
    website: body.website,
    initials: body.initials,
    slug: body.slug,
    description: body.description,
    dailyUserTarget: body.dailyUserTarget ?? 0,
    status: body.status ?? 'active',
    createdBy: userId === 'dev-admin' ? null : userId,
  })

  return c.json({ id }, 201)
})

// PUT /api/child-categories/:id
childCategoryRoutes.put('/:id', requirePermission('categories.edit'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()

  await db.update(childCategories).set({
    ...body,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(childCategories.id, id))

  return c.json({ ok: true })
})

// DELETE /api/child-categories/:id
childCategoryRoutes.delete('/:id', requirePermission('categories.delete'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  await db.delete(childCategories).where(eq(childCategories.id, id))
  return c.json({ ok: true })
})
