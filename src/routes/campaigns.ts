import { Hono } from 'hono'
import { createDb } from '../db/client'
import { campaigns, parentCategories, childCategories } from '../db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const campaignRoutes = new Hono<AppEnv>()

campaignRoutes.use('*', authMiddleware)

// GET /api/campaigns
campaignRoutes.get('/', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const categoryId = c.req.query('categoryId')
  const status = c.req.query('status')

  let conditions = []
  if (categoryId) conditions.push(eq(campaigns.parentCategoryId, categoryId))
  if (status) conditions.push(eq(campaigns.status, status as any))

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
      dailyUserTarget: campaigns.dailyUserTarget,
      priority: campaigns.priority,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      publishedAt: campaigns.publishedAt,
    })
    .from(campaigns)
    .leftJoin(parentCategories, eq(campaigns.parentCategoryId, parentCategories.id))
    .leftJoin(childCategories, eq(campaigns.childCategoryId, childCategories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(campaigns.createdAt)

  return c.json(result)
})

// GET /api/campaigns/:id
campaignRoutes.get('/:id', requirePermission('campaigns.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const item = await db.select().from(campaigns).where(eq(campaigns.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

// POST /api/campaigns
campaignRoutes.post('/', requirePermission('campaigns.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()

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
    createdBy: c.get('userId'),
    updatedBy: c.get('userId'),
  })

  return c.json({ id, code }, 201)
})

// PUT /api/campaigns/:id
campaignRoutes.put('/:id', requirePermission('campaigns.edit'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()

  await db.update(campaigns).set({
    ...body,
    updatedBy: c.get('userId'),
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  return c.json({ ok: true })
})

// POST /api/campaigns/:id/publish
campaignRoutes.post('/:id/publish', requirePermission('campaigns.edit'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  await db.update(campaigns).set({
    status: 'active',
    publishedAt: new Date().toISOString(),
    updatedBy: c.get('userId'),
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  return c.json({ ok: true })
})

// POST /api/campaigns/:id/pause
campaignRoutes.post('/:id/pause', requirePermission('campaigns.edit'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  await db.update(campaigns).set({
    status: 'paused',
    updatedBy: c.get('userId'),
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(campaigns.id, id))

  return c.json({ ok: true })
})

// DELETE /api/campaigns/:id
campaignRoutes.delete('/:id', requirePermission('campaigns.delete'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  await db.delete(campaigns).where(eq(campaigns.id, id))
  return c.json({ ok: true })
})
