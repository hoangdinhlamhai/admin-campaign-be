import { Hono } from 'hono'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { requireWhitelistedOrigin } from '../middleware/origin'
import { makeFingerprint } from '../lib/lock/fingerprint'
import { createDb } from '../db/client'
import { campaigns, campaignInstructions, campaignSettings, lockSessions, lockEvents } from '../db/schema'
import { evaluateTargetReached } from '../lib/alerts/evaluators/target-reached'
import type { AppEnv } from '../lib/types'

const lockRoutes = new Hono<AppEnv>()
lockRoutes.use('*', requireWhitelistedOrigin())

const startSchema = z.object({ contentId: z.string().min(1).max(100) })

lockRoutes.post('/start', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = startSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

  const db = createDb(c.env.DB)
  const fp = await makeFingerprint(c)
  const now = Date.now()
  const expiresAt = now + 30 * 60 * 1000

  const campaign = await db
    .select({
      id: campaigns.id,
      targetUrl: campaigns.targetUrl,
      passCode: campaigns.passCode,
      maxWrongAttempts: campaignSettings.maxWrongPassAttempts,
    })
    .from(campaigns)
    .leftJoin(campaignSettings, eq(campaigns.id, campaignSettings.campaignId))
    .where(eq(campaigns.status, 'active'))
    .orderBy(sql`random()`)
    .limit(1)
    .get()

  if (!campaign) return c.json({ error: 'NO_ACTIVE_CAMPAIGN' }, 503)

  const instructions = await db
    .select({ contentHtml: campaignInstructions.contentHtml })
    .from(campaignInstructions)
    .where(eq(campaignInstructions.campaignId, campaign.id))
    .get()

  const sessionId = crypto.randomUUID()
  const attemptsLeft = campaign.maxWrongAttempts ?? 5

  await db.insert(lockSessions).values({
    id: sessionId,
    publisherId: 'test_pub',
    contentId: parsed.data.contentId,
    campaignId: campaign.id,
    status: 'started',
    attemptsLeft,
    userFingerprint: fp,
    startedAt: now,
    expiresAt,
  }).run()

  await db.insert(lockEvents).values({
    id: crypto.randomUUID(),
    sessionId,
    eventType: 'lock_displayed',
    createdAt: now,
  }).run()

  return c.json({
    sessionId,
    campaignId: campaign.id,
    instructionsHtml: instructions?.contentHtml ?? '',
    targetUrl: campaign.targetUrl ?? '',
    attemptsLeft,
    expiresAt,
  })
})

const verifySchema = z.object({
  sessionId: z.string().uuid(),
  pass: z.string().regex(/^\d{4}$/, '4 numeric chars required'),
})

lockRoutes.post('/verify', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

  const db = createDb(c.env.DB)
  const now = Date.now()

  const session = await db.select().from(lockSessions)
    .where(eq(lockSessions.id, parsed.data.sessionId)).get()
  if (!session) return c.json({ error: 'SESSION_NOT_FOUND' }, 404)
  if (session.status !== 'started') {
    return c.json({ valid: false, attemptsLeft: 0, status: session.status })
  }
  if (session.expiresAt < now) {
    await db.update(lockSessions).set({ status: 'expired' })
      .where(eq(lockSessions.id, session.id)).run()
    return c.json({ valid: false, attemptsLeft: 0, status: 'expired' })
  }

  const campaign = await db.select({ passCode: campaigns.passCode })
    .from(campaigns).where(eq(campaigns.id, session.campaignId)).get()

  const valid = campaign?.passCode === parsed.data.pass
  const newAttempts = valid ? session.attemptsLeft : session.attemptsLeft - 1
  const newStatus = valid ? 'completed' : newAttempts <= 0 ? 'exhausted' : 'started'

  await db.update(lockSessions).set({
    attemptsLeft: newAttempts,
    status: newStatus,
    completedAt: valid ? now : null,
  }).where(eq(lockSessions.id, session.id)).run()

  // Insert events: pass_attempted + pass_valid|pass_invalid (+ unlocked if valid)
  type LockEventType = 'pass_attempted' | 'pass_valid' | 'pass_invalid' | 'unlocked'
  const events: Array<{ id: string; sessionId: string; eventType: LockEventType; createdAt: number }> = [
    { id: crypto.randomUUID(), sessionId: session.id, eventType: 'pass_attempted', createdAt: now },
    { id: crypto.randomUUID(), sessionId: session.id, eventType: valid ? 'pass_valid' : 'pass_invalid', createdAt: now },
  ]
  if (valid) {
    events.push({ id: crypto.randomUUID(), sessionId: session.id, eventType: 'unlocked', createdAt: now })
  }
  await db.insert(lockEvents).values(events).run()

  // Trigger target-reached evaluator (auto-pause + email assignee) when unlock succeeds.
  if (valid) {
    const today = new Date().toISOString().slice(0, 10)
    const evalPromise = evaluateTargetReached(db, c.env, c.executionCtx, session.campaignId, today)
      .then((r) => console.log('[target-reached]', session.campaignId, r))
      .catch((e) => console.error('[target-reached] failed', session.campaignId, e))

    if (typeof c.executionCtx?.waitUntil === 'function') {
      c.executionCtx.waitUntil(evalPromise)
    } else {
      void evalPromise
    }
  }

  return c.json({ valid, attemptsLeft: newAttempts, status: newStatus })
})

export { lockRoutes }
