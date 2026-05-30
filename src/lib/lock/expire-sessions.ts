import { eq, and, lt } from 'drizzle-orm'
import { lockSessions, lockEvents } from '../../db/schema'
import type { Database } from '../../db/client'

export async function expireSessions(db: Database) {
  const now = Date.now()
  const expired = await db
    .update(lockSessions)
    .set({ status: 'expired' })
    .where(and(eq(lockSessions.status, 'started'), lt(lockSessions.expiresAt, now)))
    .returning({ id: lockSessions.id })
    .all()

  if (expired.length > 0) {
    await db.insert(lockEvents).values(
      expired.map((s) => ({
        id: crypto.randomUUID(),
        sessionId: s.id,
        eventType: 'abandoned' as const,
        eventData: JSON.stringify({ reason: 'cron_expired' }),
        createdAt: now,
      })),
    ).run()
  }

  return { expired: expired.length, at: now }
}
