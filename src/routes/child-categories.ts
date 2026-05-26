import { Hono } from 'hono'
import { createDb } from '../db/client'
import { childCategories, parentCategories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const childCategoryRoutes = new Hono<AppEnv>()

childCategoryRoutes.use('*', authMiddleware)

// GET /api/child-categories
childCategoryRoutes.get('/', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const parentId = c.req.query('parentId')

  const query = db
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
    .leftJoin(parentCategories, eq(childCategories.parentId, parentCategories.id))

  const result = parentId
    ? await query.where(eq(childCategories.parentId, parentId))
    : await query

  return c.json(result)
})

// GET /api/child-categories/:id
childCategoryRoutes.get('/:id', requirePermission('categories.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const item = await db.select().from(childCategories).where(eq(childCategories.id, id)).get()
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

// POST /api/child-categories
childCategoryRoutes.post('/', requirePermission('categories.create'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()

  // Validate parent exists
  const parent = await db.select().from(parentCategories).where(eq(parentCategories.id, body.parentId)).get()
  if (!parent) return c.json({ error: 'Parent category not found' }, 400)

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
    createdBy: c.get('userId'),
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
