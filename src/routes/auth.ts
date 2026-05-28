import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { compareSync } from 'bcryptjs'
import { createDb } from '../db/client'
import { users, userPermissions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import type { AppEnv } from '../lib/types'

export const authRoutes = new Hono<AppEnv>()

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
  const db = createDb(c.env.DB)

  const user = await db.select().from(users).where(eq(users.email, email)).get()
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  if (user.status !== 'active') {
    return c.json({ error: 'Account disabled' }, 403)
  }

  // Verify password
  if (!compareSync(password, user.passwordHash)) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await sign(
    { sub: user.id, role: user.role, email: user.email },
    c.env.JWT_SECRET,
    'HS256'
  )

  // Update last login
  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id))

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    },
  })
})

// GET /api/auth/me — get current user info
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const db = createDb(c.env.DB)

  const user = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    phone: users.phone,
    status: users.status,
  }).from(users).where(eq(users.id, userId)).get()

  if (!user) return c.json({ error: 'User not found' }, 404)

  const ALL_PERMISSIONS = [
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete',
    'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
    'users.view', 'users.manage',
    'alerts.view', 'alerts.manage',
    'reports.view',
    'settings.view',
  ] as const

  let permissions: string[]
  if (user.role === 'admin') {
    permissions = [...ALL_PERMISSIONS]
  } else {
    const rows = await db.select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(eq(userPermissions.userId, user.id))
    permissions = rows.map(r => r.permission)
  }

  return c.json({ ...user, permissions })
})
