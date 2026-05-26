import { Hono } from 'hono'
import { createDb } from '../db/client'
import { alerts } from '../db/schema'
import { eq, sql, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import type { AppEnv } from '../lib/types'

export const alertRoutes = new Hono<AppEnv>()

alertRoutes.use('*', authMiddleware)

// GET /api/alerts
alertRoutes.get('/', requirePermission('alerts.view'), async (c) => {
  const db = createDb(c.env.DB)
  const status = c.req.query('status')

  const result = status
    ? await db.select().from(alerts).where(eq(alerts.status, status as any)).orderBy(desc(alerts.triggeredAt))
    : await db.select().from(alerts).orderBy(desc(alerts.triggeredAt))

  return c.json(result)
})

// POST /api/alerts/:id/resolve
alertRoutes.post('/:id/resolve', requirePermission('alerts.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  await db.update(alerts).set({
    status: 'resolved',
    resolvedBy: c.get('userId'),
    resolvedAt: new Date().toISOString(),
  }).where(eq(alerts.id, id))

  return c.json({ ok: true })
})

// POST /api/alerts/:id/acknowledge
alertRoutes.post('/:id/acknowledge', requirePermission('alerts.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  await db.update(alerts).set({ status: 'acknowledged' }).where(eq(alerts.id, id))

  return c.json({ ok: true })
})
