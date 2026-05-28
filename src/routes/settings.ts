import { Hono } from 'hono'
import { eq, sql, and, gte } from 'drizzle-orm'
import { createDb } from '../db/client'
import { globalSettings, alerts, auditLogs, users } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { requirePermission } from '../middleware/rbac'
import { GLOBAL_SETTING_KEYS, type GlobalSettingKey } from '../lib/settings/default-values'
import { loadGlobalSettings } from '../lib/settings/load-global-settings'
import { serializeValue, validateValue } from '../lib/settings/parse-value'
import type { AppEnv } from '../lib/types'

export const settingsRoutes = new Hono<AppEnv>()

settingsRoutes.use('*', authMiddleware)

// GET /api/settings — return all global settings as typed object
settingsRoutes.get('/', requirePermission('settings.view'), async (c) => {
  const db = createDb(c.env.DB)
  const settings = await loadGlobalSettings(db)

  // Get last update info
  const lastUpdate = await db.select({
    updatedAt: globalSettings.updatedAt,
    updatedById: globalSettings.updatedBy,
  })
    .from(globalSettings)
    .orderBy(sql`${globalSettings.updatedAt} DESC`)
    .limit(1)
    .get()

  let updatedBy: { id: string; name: string } | null = null
  if (lastUpdate?.updatedById) {
    const user = await db.select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, lastUpdate.updatedById))
      .get()
    updatedBy = user ?? null
  }

  return c.json({
    ...settings,
    updatedAt: lastUpdate?.updatedAt ?? null,
    updatedBy,
  })
})

// PUT /api/settings — batch update settings (admin only)
settingsRoutes.put('/', requirePermission('settings.manage'), async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json<Record<string, unknown>>()
  const userId = c.get('userId')

  const keysToUpdate: GlobalSettingKey[] = []
  for (const key of Object.keys(body)) {
    if (!(GLOBAL_SETTING_KEYS as readonly string[]).includes(key)) {
      return c.json({ error: `Invalid key: ${key}` }, 400)
    }
    if (!validateValue(key as GlobalSettingKey, body[key])) {
      return c.json({ error: `Invalid type for key: ${key}` }, 400)
    }
    keysToUpdate.push(key as GlobalSettingKey)
  }

  if (keysToUpdate.length === 0) {
    return c.json({ error: 'No keys provided' }, 400)
  }

  for (const key of keysToUpdate) {
    await db.insert(globalSettings).values({
      key,
      value: serializeValue(body[key] as boolean | number),
      updatedBy: userId,
    }).onConflictDoUpdate({
      target: globalSettings.key,
      set: {
        value: serializeValue(body[key] as boolean | number),
        updatedBy: userId,
        updatedAt: sql`(datetime('now'))`,
      },
    })
  }

  // Audit log
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: userId,
    action: 'settings.update',
    entityType: 'global_settings',
    entityId: null,
    changes: JSON.stringify(body),
  })

  return c.json({ ok: true, updated: keysToUpdate })
})

// GET /api/settings/triggers — count alert triggers in last N days
settingsRoutes.get('/triggers', requirePermission('settings.view'), async (c) => {
  const db = createDb(c.env.DB)
  const daysParam = c.req.query('days')
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 7, 1), 90) : 7

  const fromDate = new Date()
  fromDate.setUTCDate(fromDate.getUTCDate() - days)
  const fromStr = fromDate.toISOString().slice(0, 10)
  const toStr = new Date().toISOString().slice(0, 10)

  const rows = await db.select({
    type: alerts.type,
    count: sql<number>`count(*)`,
  })
    .from(alerts)
    .where(gte(alerts.triggeredAt, fromStr))
    .groupBy(alerts.type)

  const triggers: Record<string, number> = {}
  for (const row of rows) {
    triggers[row.type] = row.count
  }

  return c.json({
    range: { from: fromStr, to: toStr, days },
    triggers,
  })
})
