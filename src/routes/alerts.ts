import { Hono } from 'hono'
import { createDb } from '../db/client'
import { alerts, alertsMeta } from '../db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { bumpAlertsVersion } from '../lib/alerts/evaluate'
import type { AppEnv } from '../lib/types'

export const alertRoutes = new Hono<AppEnv>()

alertRoutes.use('*', authMiddleware)

// GET /api/alerts/version — lightweight counter for FE polling
alertRoutes.get('/version', requirePermission('alerts.view'), async (c) => {
  const db = createDb(c.env.DB)
  const row = await db.select({ version: alertsMeta.version })
    .from(alertsMeta)
    .where(eq(alertsMeta.id, 1))
    .get()
  return c.json({ version: row?.version ?? 0 })
})

// GET /api/alerts?status=&severity=&type=&campaignId=&from=&to=&page=&pageSize=
alertRoutes.get('/', requirePermission('alerts.view'), async (c) => {
  const db = createDb(c.env.DB)
  const status = c.req.query('status')
  const severity = c.req.query('severity')
  const type = c.req.query('type')
  const campaignId = c.req.query('campaignId')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') ?? '20', 10) || 20))

  const conds = []
  if (status) conds.push(eq(alerts.status, status as any))
  if (severity) conds.push(eq(alerts.severity, severity as any))
  if (type) conds.push(eq(alerts.type, type))
  if (campaignId) conds.push(eq(alerts.campaignId, campaignId))
  if (from) conds.push(sql`date(${alerts.triggeredAt}) >= ${from}`)
  if (to) conds.push(sql`date(${alerts.triggeredAt}) <= ${to}`)
  const where = conds.length ? and(...conds) : undefined

  const [items, totalRow] = await Promise.all([
    db.select().from(alerts)
      .where(where)
      .orderBy(desc(alerts.triggeredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ c: sql<number>`count(*)` }).from(alerts).where(where).get(),
  ])

  return c.json({ items, total: totalRow?.c ?? 0, page, pageSize })
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
  await bumpAlertsVersion(db)

  return c.json({ ok: true })
})

// POST /api/alerts/:id/acknowledge
alertRoutes.post('/:id/acknowledge', requirePermission('alerts.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const id = c.req.param('id')

  await db.update(alerts).set({ status: 'acknowledged' }).where(eq(alerts.id, id))
  await bumpAlertsVersion(db)

  return c.json({ ok: true })
})
