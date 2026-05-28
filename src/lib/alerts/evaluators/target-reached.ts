import { and, eq, sql } from 'drizzle-orm'
import { campaigns, campaignDailyStats, auditLogs } from '../../../db/schema'
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
// atomically pauses it (status='active' → 'paused'), emits an alert
// (dedup A: 1/campaign/type/day), writes an audit log, and fires off
// a notification email via ctx.waitUntil (non-blocking).
//
// The atomic UPDATE WHERE status='active' is the natural lock: if multiple
// task_completed events race here, only one will flip the row, the others
// see 0 rows affected and return early. No dedup table needed.
export async function evaluateTargetReached(
  db: Database,
  env: AppBindings,
  ctx: ExecutionContext | undefined,
  campaignId: string,
  today: string,
): Promise<TargetReachedResult> {
  const row = await db.select({
    id: campaigns.id,
    code: campaigns.code,
    name: campaigns.name,
    target: campaigns.dailyUserTarget,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
    completed: campaignDailyStats.completedCount,
  })
    .from(campaigns)
    .leftJoin(campaignDailyStats, and(
      eq(campaignDailyStats.campaignId, campaigns.id),
      eq(campaignDailyStats.statDate, today),
    ))
    .where(eq(campaigns.id, campaignId))
    .get()

  if (!row) return { paused: false, reason: 'campaign-not-found' }

  const target = row.target ?? 0
  const completed = row.completed ?? 0

  if (target <= 0) return { paused: false, reason: 'no-target' }
  if (completed < target) return { paused: false, reason: 'not-reached' }

  // Atomic pause — only flips when status is currently 'active'.
  // D1 returns { meta: { changes } } from .run() but drizzle wrapper shape varies;
  // we use a defensive cast and fall back to a re-SELECT if needed.
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
    // Fallback: re-SELECT to confirm pause happened
    const after = await db.select({ status: campaigns.status })
      .from(campaigns).where(eq(campaigns.id, campaignId)).get()
    rowsChanged = after?.status === 'paused' ? 1 : 0
  }

  if (rowsChanged === 0) {
    return { paused: false, reason: 'not-active' }
  }

  const alertId = await emitAlert(db, {
    campaignId,
    parentCategoryId: row.parentCategoryId,
    childCategoryId: row.childCategoryId,
    type: 'target_reached',
    severity: 'info',
    title: `Đã đạt target: ${row.name}`,
    description: `Hôm nay đạt ${completed}/${target} user. Đã tự động tạm dừng.`,
  })

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: null,
    action: 'campaign.auto_paused',
    entityType: 'campaign',
    entityId: campaignId,
    changes: JSON.stringify({
      reason: 'target_reached',
      completed,
      target,
    }),
  })

  let mailed = false
  if (alertId) {
    const globalsCache = await loadGlobalSettings(db)
    const settings = await resolveCampaignSettings(db, campaignId, globalsCache)

    if (settings.notifyCampaignPaused) {
      const { to, assigneeName } = await resolveRecipients(db, campaignId)
      if (to.length > 0) {
        const { subject, html } = renderTargetReachedEmail({
          campaignName: row.name,
          campaignCode: row.code,
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
          // Dev/test fallback: fire-and-forget without ctx
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
