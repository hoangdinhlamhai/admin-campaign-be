import { Hono } from 'hono'
import { and, eq, sql } from 'drizzle-orm'
import { createDb } from '../db/client'
import { campaigns, campaignAttempts, campaignDailyStats } from '../db/schema'
import { evaluateWrongPass } from '../lib/alerts/evaluators/wrong-pass'
import { evaluateNoValidEntry } from '../lib/alerts/evaluators/no-valid-entry'
import type { AppEnv } from '../lib/types'
import type { Database } from '../db/client'

export const trackRoutes = new Hono<AppEnv>()

type EventType = 'displayed' | 'pass_valid' | 'pass_invalid' | 'task_completed'
const VALID_EVENTS: EventType[] = ['displayed', 'pass_valid', 'pass_invalid', 'task_completed']

// POST /api/track/attempt — public ingest endpoint for external tracker.
// Rate-limited per IP. Inserts attempt, upserts daily_stats, then runs event-driven evaluators.
trackRoutes.post('/attempt', async (c) => {
  const body = await c.req.json().catch(() => null) as null | {
    campaignId?: string; eventType?: string; isSuccess?: boolean
    source?: string; anonymousId?: string
  }
  if (!body?.campaignId || !body.eventType || !VALID_EVENTS.includes(body.eventType as EventType)) {
    return c.json({ error: 'Invalid payload' }, 400)
  }

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'

  // Defensive: rate limiter binding may be absent in dev
  if (c.env.RATE_LIMITER) {
    const rl = await c.env.RATE_LIMITER.limit({ key: `track:${ip}` })
    if (!rl.success) return c.json({ error: 'Rate limited' }, 429)
  }

  const db = createDb(c.env.DB)

  const camp = await db.select({
    id: campaigns.id,
    dailyUserTarget: campaigns.dailyUserTarget,
  }).from(campaigns).where(eq(campaigns.id, body.campaignId)).get()
  if (!camp) return c.json({ error: 'Campaign not found' }, 404)

  const eventType = body.eventType as EventType

  await db.insert(campaignAttempts).values({
    id: crypto.randomUUID(),
    campaignId: camp.id,
    anonymousId: body.anonymousId ?? null,
    eventType,
    isSuccess: body.isSuccess ?? null,
    source: body.source ?? null,
    ipAddress: ip,
  })

  const today = new Date().toISOString().slice(0, 10)
  await upsertDailyStats(db, camp.id, today, eventType, camp.dailyUserTarget ?? 0)

  // Run event-driven evaluators (parallel-safe).
  await Promise.all([
    evaluateWrongPass(db, camp.id, today),
    evaluateNoValidEntry(db, camp.id, today),
  ])

  return c.json({ ok: true })
})

async function upsertDailyStats(
  db: Database,
  campaignId: string,
  date: string,
  eventType: EventType,
  target: number,
): Promise<void> {
  const existing = await db.select({ id: campaignDailyStats.id }).from(campaignDailyStats).where(and(
    eq(campaignDailyStats.campaignId, campaignId),
    eq(campaignDailyStats.statDate, date),
  )).get()

  if (!existing) {
    await db.insert(campaignDailyStats).values({
      id: crypto.randomUUID(),
      campaignId,
      statDate: date,
      dailyUserTarget: target,
      displayCount: eventType === 'displayed' ? 1 : 0,
      wrongEntryCount: eventType === 'pass_invalid' ? 1 : 0,
      validEntryCount: eventType === 'pass_valid' ? 1 : 0,
      completedCount: eventType === 'task_completed' ? 1 : 0,
    })
    return
  }

  const update: Record<string, unknown> = { updatedAt: sql`(datetime('now'))` }
  if (eventType === 'displayed') update.displayCount = sql`${campaignDailyStats.displayCount} + 1`
  if (eventType === 'pass_invalid') update.wrongEntryCount = sql`${campaignDailyStats.wrongEntryCount} + 1`
  if (eventType === 'pass_valid') update.validEntryCount = sql`${campaignDailyStats.validEntryCount} + 1`
  if (eventType === 'task_completed') update.completedCount = sql`${campaignDailyStats.completedCount} + 1`

  await db.update(campaignDailyStats).set(update).where(and(
    eq(campaignDailyStats.campaignId, campaignId),
    eq(campaignDailyStats.statDate, date),
  ))
}
