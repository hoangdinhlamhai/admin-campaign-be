import { and, eq, sql } from 'drizzle-orm'
import { campaigns, lockSessions, lockEvents, auditLogs } from '../../../db/schema'
import type { Database } from '../../../db/client'
import type { AppBindings } from '../../types'
import { emitAlert } from '../evaluate'
import { resolveCampaignSettings } from '../../settings/resolve-campaign-setting'
import { loadGlobalSettings } from '../../settings/load-global-settings'
import { resolveRecipients } from '../../email/resolve-recipients'
import { renderTargetReachedEmail } from '../../email/templates/target-reached'
import { sendEmail } from '../../email/resend-client'

export type TargetReachedResult =
  | { paused: false; reason: 'not-reached' | 'not-active' | 'no-target' | 'campaign-not-found' }
  | { paused: true; alertEmitted: boolean; mailed: boolean; alertId: string | null }

// Detects when a campaign reaches its dailyUserTarget for the day,
// atomically pauses it (status='active' → 'paused'), emits an alert,
// audit log, and notification email to the assignee.
//
// Source of completed count: lock_events with event_type='unlocked', filtered
// by lock_sessions.started_at within today's local-day window.
export async function evaluateTargetReached(
  db: Database,
  env: AppBindings,
  ctx: ExecutionContext | undefined,
  campaignId: string,
  today: string,
): Promise<TargetReachedResult> {
  const camp = await db.select({
    id: campaigns.id,
    code: campaigns.code,
    name: campaigns.name,
    status: campaigns.status,
    target: campaigns.dailyUserTarget,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
  })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get()

  if (!camp) return { paused: false, reason: 'campaign-not-found' }

  const target = camp.target ?? 0
  if (target <= 0) return { paused: false, reason: 'no-target' }
  if (camp.status !== 'active') return { paused: false, reason: 'not-active' }

  // Day window: today UTC midnight → next day midnight (epoch ms)
  const dayStart = new Date(`${today}T00:00:00Z`).getTime()
  const dayEnd = dayStart + 24 * 3600 * 1000

  const completedRow = await db.select({
    n: sql<number>`coalesce(count(*), 0)`,
  })
    .from(lockEvents)
    .innerJoin(lockSessions, eq(lockSessions.id, lockEvents.sessionId))
    .where(and(
      eq(lockSessions.campaignId, campaignId),
      eq(lockEvents.eventType, 'unlocked'),
      sql`${lockSessions.startedAt} >= ${dayStart}`,
      sql`${lockSessions.startedAt} < ${dayEnd}`,
    ))
    .get()

  const completed = completedRow?.n ?? 0
  if (completed < target) return { paused: false, reason: 'not-reached' }

  // Atomic pause — only flips when status is currently 'active'.
  const updateResult = await db.update(campaigns)
    .set({ status: 'paused', updatedAt: sql`(datetime('now'))` })
    .where(and(
      eq(campaigns.id, campaignId),
      eq(campaigns.status, 'active'),
    ))
    .run()

  const meta = (updateResult as { meta?: { changes?: number } }).meta
  let rowsChanged = meta?.changes
  if (rowsChanged === undefined) {
    const after = await db.select({ status: campaigns.status })
      .from(campaigns).where(eq(campaigns.id, campaignId)).get()
    rowsChanged = after?.status === 'paused' ? 1 : 0
  }

  if (rowsChanged === 0) return { paused: false, reason: 'not-active' }

  const alertId = await emitAlert(db, {
    campaignId,
    parentCategoryId: camp.parentCategoryId,
    childCategoryId: camp.childCategoryId,
    type: 'target_reached',
    severity: 'info',
    title: `Đã đạt target: ${camp.name}`,
    description: `Hôm nay đạt ${completed}/${target} user. Đã tự động tạm dừng.`,
  })

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: null,
    action: 'campaign.auto_paused',
    entityType: 'campaign',
    entityId: campaignId,
    changes: JSON.stringify({ reason: 'target_reached', completed, target }),
  })

  let mailed = false
  if (alertId) {
    const globalsCache = await loadGlobalSettings(db)
    const settings = await resolveCampaignSettings(db, campaignId, globalsCache)

    if (settings.notifyTargetReached) {
      const { to, assigneeName } = await resolveRecipients(db, campaignId)
      if (to.length > 0) {
        const { subject, html } = renderTargetReachedEmail({
          campaignName: camp.name,
          campaignCode: camp.code,
          campaignId,
          completed,
          target,
          feUrl: env.FE_URL ?? 'http://localhost:5173',
          assigneeName,
          autoReactivateEnabled: settings.autoReactivateNextDay,
        })

        const sendPromise = sendEmail(env, { to, subject, html })
          .then((r) => console.log('[email] target-reached', campaignId, r))
          .catch((e) => console.error('[email] failed', campaignId, e))

        if (typeof ctx?.waitUntil === 'function') {
          ctx.waitUntil(sendPromise)
        } else {
          void sendPromise
        }
        mailed = true
      } else {
        console.warn('[target-reached] no recipients for', campaignId)
      }
    }
  }

  return { paused: true, alertEmitted: alertId !== null, mailed, alertId }
}
