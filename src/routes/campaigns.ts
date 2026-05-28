import { Hono } from 'hono'
import { createDb } from '../db/client'
import { campaigns, campaignInstructions, campaignSettings, campaignDailyStats, parentCategories, childCategories, users, auditLogs } from '../db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { requireCampaignOwnerOrAdmin } from '../middleware/ownership'
import { emitCampaignPausedAlert } from '../lib/alerts/evaluators/campaign-paused'
import type { AppEnv } from '../lib/types'

export const campaignRoutes = new Hono<AppEnv>()

campaignRoutes.use('*', authMiddleware)

// GET /api/campaigns?categoryId&status&date=YYYY-MM-DD|all
// `date` defaults to today. Use `date=all` to aggregate stats across all dates.
campaignRoutes.get('/', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const categoryId = c.req.query('categoryId')
  const status = c.req.query('status')
  const dateParam = c.req.query('date')

  const today = new Date().toISOString().slice(0, 10)
  const isAllTime = dateParam === 'all'
  const targetDate = !isAllTime ? (dateParam || today) : null

  let conditions = []
  if (categoryId) conditions.push(eq(campaigns.parentCategoryId, categoryId))
  if (status) conditions.push(eq(campaigns.status, status as any))

  // Build stats subquery: either per-day (matching date) or aggregated all-time
  const statsAgg = isAllTime
    ? db
        .select({
          campaignId: campaignDailyStats.campaignId,
          completedCount: sql<number>`SUM(${campaignDailyStats.completedCount})`.as('completedCount'),
          missingCount: sql<number>`SUM(${campaignDailyStats.missingCount})`.as('missingCount'),
          displayCount: sql<number>`SUM(${campaignDailyStats.displayCount})`.as('displayCount'),
          wrongEntryCount: sql<number>`SUM(${campaignDailyStats.wrongEntryCount})`.as('wrongEntryCount'),
          validEntryCount: sql<number>`SUM(${campaignDailyStats.validEntryCount})`.as('validEntryCount'),
        })
        .from(campaignDailyStats)
        .groupBy(campaignDailyStats.campaignId)
        .as('stats')
    : db
        .select({
          campaignId: campaignDailyStats.campaignId,
          completedCount: campaignDailyStats.completedCount,
          missingCount: campaignDailyStats.missingCount,
          displayCount: campaignDailyStats.displayCount,
          wrongEntryCount: campaignDailyStats.wrongEntryCount,
          validEntryCount: campaignDailyStats.validEntryCount,
        })
        .from(campaignDailyStats)
        .where(eq(campaignDailyStats.statDate, targetDate!))
        .as('stats')

  const result = await db
    .select({
      id: campaigns.id,
      code: campaigns.code,
      name: campaigns.name,
      parentCategoryId: campaigns.parentCategoryId,
      parentCategoryName: parentCategories.name,
      childCategoryId: campaigns.childCategoryId,
      childCategoryName: childCategories.name,
      keyword: campaigns.keyword,
      passCode: campaigns.passCodeEncrypted,
      dailyUserTarget: campaigns.dailyUserTarget,
      priority: campaigns.priority,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      publishedAt: campaigns.publishedAt,
      assignedTo: campaigns.assignedTo,
      assignedToName: users.name,
      completedCount: sql<number>`COALESCE(${statsAgg.completedCount}, 0)`,
      missingCount: sql<number>`COALESCE(${statsAgg.missingCount}, 0)`,
      displayCount: sql<number>`COALESCE(${statsAgg.displayCount}, 0)`,
      wrongEntryCount: sql<number>`COALESCE(${statsAgg.wrongEntryCount}, 0)`,
      validEntryCount: sql<number>`COALESCE(${statsAgg.validEntryCount}, 0)`,
    })
    .from(campaigns)
    .leftJoin(parentCategories, eq(campaigns.parentCategoryId, parentCategories.id))
    .leftJoin(childCategories, eq(campaigns.childCategoryId, childCategories.id))
    .leftJoin(users, eq(campaigns.assignedTo, users.id))
    .leftJoin(statsAgg, eq(statsAgg.campaignId, campaigns.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(campaigns.createdAt)

  const role = c.get('userRole')
  const userId = c.get('userId')
  const enriched = result.map(r => ({
    ...r,
    isOwner: role === 'admin' || r.assignedTo === userId,
  }))

  return c.json(enriched)
})

// GET /api/campaigns/:id
campaignRoutes.get('/:id', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const item = await db.select().from(campaigns).where(eq(campaigns.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)

  let assignedToName: string | null = null
  if (item.assignedTo) {
    const u = await db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, item.assignedTo))
      .get()
    assignedToName = u?.name ?? null
  }

  const role = c.get('userRole')
  const userId = c.get('userId')
  const isOwner = role === 'admin' || item.assignedTo === userId

  return c.json({ ...item, assignedToName, isOwner })
})

// POST /api/campaigns/full — atomic create campaign + instructions + settings
campaignRoutes.post('/full', requirePermission('campaigns.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const userId = c.get('userId')
  const createdBy = userId === 'dev-admin' ? null : userId
  const role = c.get('userRole')

  if (!body.parentCategoryId || !body.name || !body.instructions?.contentHtml) {
    return c.json({ error: 'Missing required fields: parentCategoryId, name, instructions.contentHtml' }, 400)
  }

  // Admin can assign to anyone (or NULL); employee force = self
  const assignedTo = role === 'admin'
    ? (body.assignedTo ?? null)
    : (userId === 'dev-admin' ? null : userId)

  const id = crypto.randomUUID()
  const count = await db.select({ count: sql<number>`count(*)` }).from(campaigns).get()
  const code = `CMP-${String((count?.count ?? 0) + 1).padStart(3, '0')}`
  const status = body.status === 'active' ? 'active' : 'draft'
  const now = new Date().toISOString()

  try {
    await db.insert(campaigns).values({
      id,
      code,
      parentCategoryId: body.parentCategoryId,
      childCategoryId: body.childCategoryId ?? null,
      name: body.name,
      keyword: body.keyword ?? null,
      targetUrl: body.targetUrl ?? null,
      passCodeEncrypted: body.passCode ?? null,
      dailyUserTarget: body.dailyUserTarget ?? 0,
      priority: body.priority ?? 'medium',
      maxWrongAttempts: body.maxWrongAttempts ?? null,
      status,
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      publishedAt: status === 'active' ? now : null,
      assignedTo,
      createdBy,
      updatedBy: createdBy,
    })

    const instructionId = crypto.randomUUID()
    await db.insert(campaignInstructions).values({
      id: instructionId,
      campaignId: id,
      contentHtml: body.instructions.contentHtml,
      contentJson: body.instructions.contentJson ? JSON.stringify(body.instructions.contentJson) : null,
      version: 1,
      updatedBy: createdBy,
    })

    const s = body.settings ?? {}
    await db.insert(campaignSettings).values({
      campaignId: id,
      notifyLowUsers: s.notifyLowUsers ?? false,
      lowUsersThreshold: s.lowUsersThreshold ?? null,
      notifyCampaignPaused: s.notifyCampaignPaused ?? false,
      autoReactivateNextDay: s.autoReactivateNextDay ?? false,
      limitWrongPass: s.limitWrongPass ?? false,
      maxWrongPassAttempts: s.maxWrongPassAttempts ?? null,
      pauseOnNoValidEntry: s.pauseOnNoValidEntry ?? false,
      noValidEntryDisplays: s.noValidEntryDisplays ?? null,
      updatedBy: createdBy,
    })

    return c.json({ id, code }, 201)
  } catch (err) {
    // cleanup on error
    await db.delete(campaigns).where(eq(campaigns.id, id))
    return c.json({ error: err instanceof Error ? err.message : 'Failed to create campaign' }, 500)
  }
})

// PUT /api/campaigns/:id/full — atomic overwrite (no version history)
campaignRoutes.put('/:id/full', requirePermission('campaigns.edit'), requireCampaignOwnerOrAdmin(), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()
  const userId = c.get('userId')
  const updatedBy = userId === 'dev-admin' ? null : userId

  const existing = await db.select().from(campaigns).where(eq(campaigns.id, id)).get()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  await db.update(campaigns).set({
    parentCategoryId: body.parentCategoryId ?? existing.parentCategoryId,
    childCategoryId: body.childCategoryId ?? existing.childCategoryId,
    name: body.name ?? existing.name,
    keyword: body.keyword ?? existing.keyword,
    targetUrl: body.targetUrl ?? existing.targetUrl,
    passCodeEncrypted: body.passCode ?? existing.passCodeEncrypted,
    dailyUserTarget: body.dailyUserTarget ?? existing.dailyUserTarget,
    priority: body.priority ?? existing.priority,
    maxWrongAttempts: body.maxWrongAttempts ?? existing.maxWrongAttempts,
    status: body.status ?? existing.status,
    startsAt: body.startsAt ?? existing.startsAt,
    endsAt: body.endsAt ?? existing.endsAt,
    updatedBy,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  if (body.instructions) {
    await db.update(campaignInstructions).set({
      contentHtml: body.instructions.contentHtml,
      contentJson: body.instructions.contentJson ? JSON.stringify(body.instructions.contentJson) : null,
      updatedBy,
      updatedAt: sql`(datetime('now'))`,
    }).where(eq(campaignInstructions.campaignId, id))
  }

  if (body.settings) {
    const s = body.settings
    await db.update(campaignSettings).set({
      notifyLowUsers: s.notifyLowUsers,
      lowUsersThreshold: s.lowUsersThreshold ?? null,
      notifyCampaignPaused: s.notifyCampaignPaused,
      autoReactivateNextDay: s.autoReactivateNextDay,
      limitWrongPass: s.limitWrongPass,
      maxWrongPassAttempts: s.maxWrongPassAttempts ?? null,
      pauseOnNoValidEntry: s.pauseOnNoValidEntry,
      noValidEntryDisplays: s.noValidEntryDisplays ?? null,
      updatedBy,
      updatedAt: sql`(datetime('now'))`,
    }).where(eq(campaignSettings.campaignId, id))
  }

  return c.json({ ok: true })
})

// GET /api/campaigns/:id/full — fetch full campaign with instructions and settings
campaignRoutes.get('/:id/full', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, id)).get()
  if (!campaign) return c.json({ error: 'Not found' }, 404)

  const instructions = await db.select().from(campaignInstructions).where(eq(campaignInstructions.campaignId, id)).get()
  const settings = await db.select().from(campaignSettings).where(eq(campaignSettings.campaignId, id)).get()

  let assignedToName: string | null = null
  if (campaign.assignedTo) {
    const u = await db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, campaign.assignedTo))
      .get()
    assignedToName = u?.name ?? null
  }

  const role = c.get('userRole')
  const userId = c.get('userId')
  const isOwner = role === 'admin' || campaign.assignedTo === userId

  return c.json({
    ...campaign,
    passCode: campaign.passCodeEncrypted,
    assignedToName,
    isOwner,
    instructions: instructions ? {
      contentHtml: instructions.contentHtml,
      contentJson: instructions.contentJson ? JSON.parse(instructions.contentJson) : null,
    } : null,
    settings: settings ?? null,
  })
})

// POST /api/campaigns
campaignRoutes.post('/', requirePermission('campaigns.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()
  const userId = c.get('userId')
  const role = c.get('userRole')

  // Admin can assign to anyone (or NULL); employee force = self
  const assignedTo = role === 'admin'
    ? (body.assignedTo ?? null)
    : (userId === 'dev-admin' ? null : userId)

  // Auto-generate code
  const count = await db.select({ count: sql<number>`count(*)` }).from(campaigns).get()
  const code = `CMP-${String((count?.count ?? 0) + 1).padStart(3, '0')}`

  await db.insert(campaigns).values({
    id,
    code,
    parentCategoryId: body.parentCategoryId,
    childCategoryId: body.childCategoryId ?? null,
    name: body.name,
    keyword: body.keyword,
    targetUrl: body.targetUrl,
    passCodeEncrypted: body.passCode,
    dailyUserTarget: body.dailyUserTarget ?? 0,
    priority: body.priority ?? 'medium',
    maxWrongAttempts: body.maxWrongAttempts,
    status: 'draft',
    assignedTo,
    createdBy: userId === 'dev-admin' ? null : userId,
    updatedBy: userId === 'dev-admin' ? null : userId,
  })

  return c.json({ id, code }, 201)
})

// PUT /api/campaigns/:id
campaignRoutes.put('/:id', requirePermission('campaigns.edit'), requireCampaignOwnerOrAdmin(), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()
  const userId = c.get('userId')
  const updatedBy = userId === 'dev-admin' ? null : userId

  // Strip assignedTo — reassignment goes through PATCH /:id/assignee
  const { assignedTo: _ignored, ...updateFields } = body

  await db.update(campaigns).set({
    ...updateFields,
    updatedBy,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  return c.json({ ok: true })
})

// POST /api/campaigns/:id/publish
campaignRoutes.post('/:id/publish', requirePermission('campaigns.edit'), requireCampaignOwnerOrAdmin(), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const userId = c.get('userId')
  const updatedBy = userId === 'dev-admin' ? null : userId

  await db.update(campaigns).set({
    status: 'active',
    publishedAt: new Date().toISOString(),
    updatedBy,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  return c.json({ ok: true })
})

// POST /api/campaigns/:id/pause
campaignRoutes.post('/:id/pause', requirePermission('campaigns.edit'), requireCampaignOwnerOrAdmin(), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const userId = c.get('userId')
  const updatedBy = userId === 'dev-admin' ? null : userId

  await db.update(campaigns).set({
    status: 'paused',
    updatedBy,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  // Emit campaign_paused alert when settings opt-in. Failures are logged but
  // must not break the pause flow.
  try {
    await emitCampaignPausedAlert(db, id, 'manual')
  } catch (err) {
    console.error('[campaigns/pause] emit alert failed', err)
  }

  return c.json({ ok: true })
})

// PATCH /api/campaigns/:id/assignee — reassign campaign owner (admin only)
campaignRoutes.patch('/:id/assignee', requirePermission('campaigns.edit'), async (c) => {
  if (c.get('userRole') !== 'admin') {
    return c.json({ error: 'Forbidden — admin only' }, 403)
  }
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json<{ assignedTo: string | null }>()
  const newAssignee = body.assignedTo ?? null

  const cur = await db.select({ assignedTo: campaigns.assignedTo })
    .from(campaigns).where(eq(campaigns.id, id)).get()
  if (!cur) return c.json({ error: 'Not found' }, 404)

  // Validate: if newAssignee provided, ensure user exists
  if (newAssignee) {
    const u = await db.select({ id: users.id })
      .from(users).where(eq(users.id, newAssignee)).get()
    if (!u) return c.json({ error: 'User not found' }, 400)
  }

  const userId = c.get('userId')
  const updatedBy = userId === 'dev-admin' ? null : userId

  await db.update(campaigns).set({
    assignedTo: newAssignee,
    updatedBy,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  // Audit log
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: updatedBy,
    action: 'campaign.assigned',
    entityType: 'campaign',
    entityId: id,
    changes: JSON.stringify({ from: cur.assignedTo, to: newAssignee }),
  })

  return c.json({ ok: true })
})

// DELETE /api/campaigns/:id
campaignRoutes.delete('/:id', requirePermission('campaigns.delete'), requireCampaignOwnerOrAdmin(), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  await db.delete(campaigns).where(eq(campaigns.id, id))
  return c.json({ ok: true })
})
