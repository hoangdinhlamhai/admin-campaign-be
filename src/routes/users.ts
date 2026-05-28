import { Hono } from 'hono'
import { createDb } from '../db/client'
import { users, userPermissions, campaigns } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const userRoutes = new Hono<AppEnv>()

userRoutes.use('*', authMiddleware)

// GET /api/users
userRoutes.get('/', requirePermission('users.view'), async (c) => {
  const db = createDb(c.env.DB)
  const result = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    role: users.role,
    status: users.status,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  }).from(users).orderBy(users.createdAt)
  return c.json(result)
})

// GET /api/users/:id
userRoutes.get('/:id', requirePermission('users.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  const user = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    role: users.role,
    status: users.status,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, id)).get()

  if (!user) return c.json({ error: 'Not found' }, 404)

  // Get permissions for employee
  const perms = user.role === 'employee'
    ? await db.select({ permission: userPermissions.permission }).from(userPermissions).where(eq(userPermissions.userId, id))
    : []

  return c.json({ ...user, permissions: perms.map((p) => p.permission) })
})

// POST /api/users
userRoutes.post('/', requirePermission('users.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json()
  const id = crypto.randomUUID()

  await db.insert(users).values({
    id,
    name: body.name,
    email: body.email,
    phone: body.phone,
    passwordHash: '$placeholder', // TODO: hash password
    role: body.role ?? 'employee',
    status: body.status ?? 'active',
    createdBy: c.get('userId') === 'dev-admin' ? null : c.get('userId'),
  })

  // Set permissions for employee
  if (body.role !== 'admin' && body.permissions?.length) {
    await db.insert(userPermissions).values(
      body.permissions.map((p: string) => ({ userId: id, permission: p }))
    )
  }

  return c.json({ id }, 201)
})

// PUT /api/users/:id
userRoutes.put('/:id', requirePermission('users.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const body = await c.req.json()

  await db.update(users).set({
    name: body.name,
    email: body.email,
    phone: body.phone,
    role: body.role,
    status: body.status,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(users.id, id))

  // Update permissions: delete all then re-insert
  if (body.permissions) {
    await db.delete(userPermissions).where(eq(userPermissions.userId, id))
    if (body.role !== 'admin' && body.permissions.length > 0) {
      await db.insert(userPermissions).values(
        body.permissions.map((p: string) => ({ userId: id, permission: p }))
      )
    }
  }

  return c.json({ ok: true })
})

// DELETE /api/users/:id
userRoutes.delete('/:id', requirePermission('users.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  // Prevent self-delete
  if (id === c.get('userId')) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  // Nullify assignedTo on campaigns owned by this user (SQLite ALTER TABLE didn't enforce FK SET NULL)
  await db.update(campaigns)
    .set({ assignedTo: null })
    .where(eq(campaigns.assignedTo, id))

  await db.delete(users).where(eq(users.id, id))
  return c.json({ ok: true })
})

// GET /api/users/:id/campaigns — list campaigns this user is assigned to
userRoutes.get('/:id/campaigns', requirePermission('users.view'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')
  const result = await db.select({
    id: campaigns.id,
    code: campaigns.code,
    name: campaigns.name,
    status: campaigns.status,
    priority: campaigns.priority,
    createdAt: campaigns.createdAt,
  }).from(campaigns)
    .where(eq(campaigns.assignedTo, id))
    .orderBy(campaigns.createdAt)
  return c.json(result)
})
