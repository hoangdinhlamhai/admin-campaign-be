import { Hono } from 'hono'
import { z } from 'zod'
import { requireWhitelistedOrigin } from '../middleware/origin'
import { createDb } from '../db/client'
import { lockEvents } from '../db/schema'
import type { AppEnv } from '../lib/types'

const ALLOWED_CLIENT_EVENTS = ['unlock_clicked', 'target_clicked', 'abandoned'] as const

const eventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(ALLOWED_CLIENT_EVENTS),
  eventData: z.record(z.string(), z.unknown()).optional(),
})

const eventsRoutes = new Hono<AppEnv>()
eventsRoutes.use('*', requireWhitelistedOrigin())

eventsRoutes.post('/', async (c) => {
  const contentType = c.req.header('Content-Type') ?? ''

  if (!contentType.includes('text/plain') && !contentType.includes('application/json')) {
    return c.json({ error: 'UNSUPPORTED_CONTENT_TYPE' }, 415)
  }

  const raw = await c.req.text()
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return c.json({ error: 'INVALID_JSON' }, 400)
  }

  const parsed = eventSchema.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: 'Invalid body', details: parsed.error.format() }, 400)
  }

  const db = createDb(c.env.DB)
  await db
    .insert(lockEvents)
    .values({
      id: crypto.randomUUID(),
      sessionId: parsed.data.sessionId,
      eventType: parsed.data.eventType,
      eventData: parsed.data.eventData ? JSON.stringify(parsed.data.eventData) : null,
      createdAt: Date.now(),
    })
    .run()

  return c.body(null, 204)
})

export { eventsRoutes }
