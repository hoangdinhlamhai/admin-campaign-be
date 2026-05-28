import { Hono } from 'hono'
import { createDb } from '../db/client'
import { parentCategories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const parentCategoryRoutes = new Hono<AppEnv>()

parentCategoryRoutes.use('*', authMiddleware)

// GET /api/parent-categories
parentCategoryRoutes.get('/', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const result = await db.select().from(parentCategories).orderBy(parentCategories.createdAt)
  return c.json(result)
})

// GET /api/parent-categories/:id
parentCategoryRoutes.get('/:id', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const item = await db.select().from(parentCategories).where(eq(parentCategories.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
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
