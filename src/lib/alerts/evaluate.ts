import { and, eq, sql } from 'drizzle-orm'
import { alerts, alertsMeta } from '../../db/schema'
import type { Database } from '../../db/client'
import type { EmitAlertParams } from './types'

// Insert alert with dedup strategy A: 1 open / campaign / type / day
// Returns new alert id, or null if dedup hit (existing open alert today).
export async function emitAlert(db: Database, p: EmitAlertParams): Promise<string | null> {
  const existing = await db.select({ id: alerts.id }).from(alerts).where(and(
    eq(alerts.campaignId, p.campaignId),
    eq(alerts.type, p.type),
    eq(alerts.status, 'open'),
    sql`date(${alerts.triggeredAt}) = date('now')`,
  )).get()
  if (existing) return null

  const id = crypto.randomUUID()
  await db.insert(alerts).values({
    id,
    campaignId: p.campaignId,
    parentCategoryId: p.parentCategoryId ?? null,
    childCategoryId: p.childCategoryId ?? null,
    type: p.type,
    severity: p.severity,
    status: 'open',
    title: p.title,
    description: p.description ?? null,
  })
  await bumpAlertsVersion(db)
  return id
}

// Monotonic version counter so FE can poll cheaply (~20B response) and only
// fetch the full list when version changed.
export async function bumpAlertsVersion(db: Database): Promise<void> {
  // Defensive: ensure singleton row exists (in case seed missed it).
  await db.insert(alertsMeta).values({ id: 1, version: 0 }).onConflictDoNothing()
  await db.update(alertsMeta)
    .set({
      version: sql`${alertsMeta.version} + 1`,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(alertsMeta.id, 1))
}
