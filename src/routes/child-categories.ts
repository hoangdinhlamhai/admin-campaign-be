import { Hono } from 'hono'
import { createDb } from '../db/client'
import { childCategories, parentCategories, campaigns, lockSessions, lockEvents } from '../db/schema'
import { eq, sql, and } from 'drizzle-orm'
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
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  // Subquery: campaign counts per child category
  const campaignCountSub = db
    .select({
      childId: campaigns.childCategoryId,
      total: sql<number>`count(*)`.as('camp_total'),
      paused: sql<number>`sum(case when ${campaigns.status} = 'paused' then 1 else 0 end)`.as('camp_paused'),
      target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`.as('camp_target'),
    })
    .from(campaigns)
    .groupBy(campaigns.childCategoryId)
    .as('campaign_count_sub')

  // Subquery: completed count from lock_events (unlocked) per child category in date range
  const rangeStatsSub = db
    .select({
      childId: campaigns.childCategoryId,
      completed: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'unlocked' then 1 else 0 end), 0)`.as('rs_completed'),
    })
    .from(campaigns)
    .innerJoin(
      lockSessions,
      and(
        eq(lockSessions.campaignId, campaigns.id),
        sql`${lockSessions.startedAt} >= ${fromMs}`,
        sql`${lockSessions.startedAt} < ${toMs}`,
      ),
    )
    .innerJoin(lockEvents, eq(lockEvents.sessionId, lockSessions.id))
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
      rsTarget: sql<number>`coalesce(${campaignCountSub.target}, 0)`,
      rsCompleted: sql<number>`coalesce(${rangeStatsSub.completed}, 0)`,
    })
    .from(childCategories)
    .leftJoin(parentCategories, eq(childCategories.parentId, parentCategories.id))
    .leftJoin(campaignCountSub, eq(campaignCountSub.childId, childCategories.id))
    .leftJoin(rangeStatsSub, eq(rangeStatsSub.childId, childCategories.id))

  const rows = parentId
    ? await baseQuery.where(eq(childCategories.parentId, parentId))
    : await baseQuery

  const result = rows.map((r) => {
    const target = r.rsTarget ?? 0
    const completed = r.rsCompleted ?? 0
    const missing = Math.max(0, target - completed)
    return {
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
        target,
        completed,
        missing,
      },
    }
  })

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

  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  // Range stats: target = SUM active campaigns daily_user_target; completed = COUNT lock_events 'unlocked'
  const targetRow = await db
    .select({
      target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`,
    })
    .from(campaigns)
    .where(eq(campaigns.childCategoryId, id))
    .get()

  const completedRow = await db
    .select({
      completed: sql<number>`coalesce(count(*), 0)`,
    })
    .from(lockEvents)
    .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
    .innerJoin(campaigns, eq(campaigns.id, lockSessions.campaignId))
    .where(
      and(
        eq(campaigns.childCategoryId, id),
        eq(lockEvents.eventType, 'unlocked'),
        sql`${lockSessions.startedAt} >= ${fromMs}`,
        sql`${lockSessions.startedAt} < ${toMs}`,
      ),
    )
    .get()

  const rsTarget = targetRow?.target ?? 0
  const rsCompleted = completedRow?.completed ?? 0
  const rsMissing = Math.max(0, rsTarget - rsCompleted)

  // Campaigns breakdown: each campaign with aggregated stats in range from lock_events
  const campaignRows = await db
    .select({
      id: campaigns.id,
      code: campaigns.code,
      name: campaigns.name,
      status: campaigns.status,
      dailyUserTarget: campaigns.dailyUserTarget,
      completedCount: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'unlocked' then 1 else 0 end), 0)`,
      displayCount: sql<number>`coalesce(sum(case when ${lockEvents.eventType} = 'lock_displayed' then 1 else 0 end), 0)`,
    })
    .from(campaigns)
    .leftJoin(
      lockSessions,
      and(
        eq(lockSessions.campaignId, campaigns.id),
        sql`${lockSessions.startedAt} >= ${fromMs}`,
        sql`${lockSessions.startedAt} < ${toMs}`,
      ),
    )
    .leftJoin(lockEvents, eq(lockEvents.sessionId, lockSessions.id))
    .where(eq(campaigns.childCategoryId, id))
    .groupBy(campaigns.id)

  const campaignsList = campaignRows.map((r) => {
    const target = r.dailyUserTarget ?? 0
    const completed = r.completedCount ?? 0
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      dailyUserTarget: target,
      completedCount: completed,
      missingCount: Math.max(0, target - completed),
      displayCount: r.displayCount ?? 0,
    }
  })

  return c.json({
    ...childRow,
    campaignCount,
    pausedCount,
    rangeStats: {
      target: rsTarget,
      completed: rsCompleted,
      missing: rsMissing,
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
