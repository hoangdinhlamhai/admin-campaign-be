import { Hono } from 'hono'
import { createDb } from '../db/client'
import { parentCategories, childCategories, campaigns, lockSessions, lockEvents } from '../db/schema'
import { eq, sql, and, ne } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { parseDateRange } from '../lib/stats/range-helpers'
import type { AppEnv } from '../lib/types'

export const parentCategoryRoutes = new Hono<AppEnv>()

parentCategoryRoutes.use('*', authMiddleware)

// GET /api/parent-categories?from=YYYY-MM-DD&to=YYYY-MM-DD
parentCategoryRoutes.get('/', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  // Subquery: child count per parent (exclude archived)
  const childCountSub = db
    .select({
      parentId: childCategories.parentId,
      count: sql<number>`count(*)`.as('child_cnt'),
    })
    .from(childCategories)
    .where(ne(childCategories.status, 'archived'))
    .groupBy(childCategories.parentId)
    .as('child_count_sub')

  // Subquery: campaign counts + target per parent
  const campaignCountSub = db
    .select({
      parentId: campaigns.parentCategoryId,
      total: sql<number>`count(*)`.as('camp_total'),
      paused: sql<number>`sum(case when ${campaigns.status} = 'paused' then 1 else 0 end)`.as('camp_paused'),
      target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`.as('camp_target'),
    })
    .from(campaigns)
    .groupBy(campaigns.parentCategoryId)
    .as('campaign_count_sub')

  // Subquery: completed count from lock_events 'unlocked' per parent in date range
  const rangeStatsSub = db
    .select({
      parentId: campaigns.parentCategoryId,
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
    .groupBy(campaigns.parentCategoryId)
    .as('range_stats_sub')

  // Main query
  const rows = await db
    .select({
      id: parentCategories.id,
      name: parentCategories.name,
      website: parentCategories.website,
      initials: parentCategories.initials,
      slug: parentCategories.slug,
      description: parentCategories.description,
      dailyUserTarget: parentCategories.dailyUserTarget,
      status: parentCategories.status,
      createdAt: parentCategories.createdAt,
      childCount: sql<number>`coalesce(${childCountSub.count}, 0)`,
      campaignCount: sql<number>`coalesce(${campaignCountSub.total}, 0)`,
      pausedCount: sql<number>`coalesce(${campaignCountSub.paused}, 0)`,
      rsTarget: sql<number>`coalesce(${campaignCountSub.target}, 0)`,
      rsCompleted: sql<number>`coalesce(${rangeStatsSub.completed}, 0)`,
    })
    .from(parentCategories)
    .leftJoin(childCountSub, eq(childCountSub.parentId, parentCategories.id))
    .leftJoin(campaignCountSub, eq(campaignCountSub.parentId, parentCategories.id))
    .leftJoin(rangeStatsSub, eq(rangeStatsSub.parentId, parentCategories.id))
    .orderBy(parentCategories.createdAt)

  const result = rows.map((r) => {
    const target = r.rsTarget ?? 0
    const completed = r.rsCompleted ?? 0
    return {
      id: r.id,
      name: r.name,
      website: r.website,
      initials: r.initials,
      slug: r.slug,
      description: r.description,
      dailyUserTarget: r.dailyUserTarget,
      status: r.status,
      createdAt: r.createdAt,
      childCount: r.childCount ?? 0,
      campaignCount: r.campaignCount ?? 0,
      pausedCount: r.pausedCount ?? 0,
      rangeStats: {
        target,
        completed,
        missing: Math.max(0, target - completed),
      },
    }
  })

  return c.json(result)
})

// GET /api/parent-categories/:id?from=YYYY-MM-DD&to=YYYY-MM-DD
parentCategoryRoutes.get('/:id', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const range = parseDateRange(c.req.query('from'), c.req.query('to'))
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime() + 24 * 3600 * 1000

  const parent = await db.select().from(parentCategories).where(eq(parentCategories.id, id)).get()
  if (!parent) return c.json({ error: 'Not found' }, 404)

  // Counts under this parent
  const countRow = await db
    .select({
      childCount: sql<number>`count(distinct ${childCategories.id})`,
    })
    .from(childCategories)
    .where(and(eq(childCategories.parentId, id), ne(childCategories.status, 'archived')))
    .get()

  const directCampRow = await db
    .select({
      total: sql<number>`count(*)`,
      paused: sql<number>`sum(case when ${campaigns.status} = 'paused' then 1 else 0 end)`,
      target: sql<number>`coalesce(sum(case when ${campaigns.status} = 'active' then ${campaigns.dailyUserTarget} else 0 end), 0)`,
    })
    .from(campaigns)
    .where(eq(campaigns.parentCategoryId, id))
    .get()

  const childCount = countRow?.childCount ?? 0
  const campaignCount = directCampRow?.total ?? 0
  const pausedCount = directCampRow?.paused ?? 0
  const rsTarget = directCampRow?.target ?? 0

  // Completed = COUNT lock_events 'unlocked' for campaigns under this parent in date range
  const completedRow = await db
    .select({ completed: sql<number>`coalesce(count(*), 0)` })
    .from(lockEvents)
    .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
    .innerJoin(campaigns, eq(campaigns.id, lockSessions.campaignId))
    .where(
      and(
        eq(campaigns.parentCategoryId, id),
        eq(lockEvents.eventType, 'unlocked'),
        sql`${lockSessions.startedAt} >= ${fromMs}`,
        sql`${lockSessions.startedAt} < ${toMs}`,
      ),
    )
    .get()

  const rsCompleted = completedRow?.completed ?? 0
  const rsMissing = Math.max(0, rsTarget - rsCompleted)

  // Children breakdown reusing list-style subqueries
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

  const childRows = await db
    .select({
      id: childCategories.id,
      parentId: childCategories.parentId,
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
    .leftJoin(campaignCountSub, eq(campaignCountSub.childId, childCategories.id))
    .leftJoin(rangeStatsSub, eq(rangeStatsSub.childId, childCategories.id))
    .where(eq(childCategories.parentId, id))

  const children = childRows.map((r) => {
    const target = r.rsTarget ?? 0
    const completed = r.rsCompleted ?? 0
    return {
      id: r.id,
      parentId: r.parentId,
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
        missing: Math.max(0, target - completed),
      },
    }
  })

  return c.json({
    ...parent,
    childCount,
    campaignCount,
    pausedCount,
    rangeStats: {
      target: rsTarget,
      completed: rsCompleted,
      missing: rsMissing,
    },
    children,
  })
})

// POST /api/parent-categories
parentCategoryRoutes.post('/', requirePermission('categories.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()

  await db.insert(parentCategories).values({
    id,
    name: body.name,
    website: body.website,
    initials: body.initials,
    slug: body.slug,
    description: body.description,
    dailyUserTarget: body.dailyUserTarget ?? 0,
    status: body.status ?? 'active',
    createdBy: c.get('userId') === 'dev-admin' ? null : c.get('userId'),
  })

  return c.json({ id }, 201)
})

// PUT /api/parent-categories/:id
parentCategoryRoutes.put('/:id', requirePermission('categories.edit'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()

  await db.update(parentCategories).set({
    ...body,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(parentCategories.id, id))

  return c.json({ ok: true })
})

// DELETE /api/parent-categories/:id
parentCategoryRoutes.delete('/:id', requirePermission('categories.delete'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  await db.delete(parentCategories).where(eq(parentCategories.id, id))
  return c.json({ ok: true })
})
