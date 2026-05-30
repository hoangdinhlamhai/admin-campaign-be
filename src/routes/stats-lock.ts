import { Hono } from 'hono'
import { z } from 'zod/v4'
import { authMiddleware } from '../middleware/auth'
import type { AppEnv } from '../lib/types'

export const statsLockRoutes = new Hono<AppEnv>()

statsLockRoutes.use('*', authMiddleware)

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

function defaultRange() {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  return { from: weekAgo, to: today }
}

function parseRange(query: Record<string, string>) {
  const parsed = dateRangeSchema.safeParse(query)
  const defaults = defaultRange()
  const from = (parsed.success && parsed.data.from) || defaults.from
  const to = (parsed.success && parsed.data.to) || defaults.to
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime() + 24 * 3600 * 1000 // end of day
  return { fromMs, toMs }
}

// GET /overview
statsLockRoutes.get('/overview', async (c) => {
  const { fromMs, toMs } = parseRange(c.req.query())
  const db = c.env.DB

  const row = await db.prepare(`
    SELECT
      COALESCE((SELECT SUM(daily_user_target) FROM campaigns WHERE status='active'), 0) AS totalUserTarget,
      COALESCE((SELECT COUNT(*) FROM lock_events WHERE event_type='unlocked'
        AND created_at >= ?1 AND created_at < ?2), 0) AS totalCompleted,
      COALESCE((SELECT COUNT(*) FROM campaigns WHERE status='paused'), 0) AS pausedCount,
      COALESCE((SELECT COUNT(*) FROM lock_events WHERE event_type='pass_invalid'
        AND created_at >= ?1 AND created_at < ?2), 0) AS totalWrongEntries,
      COALESCE((SELECT COUNT(*) FROM lock_events WHERE event_type='lock_displayed'
        AND created_at >= ?1 AND created_at < ?2), 0) AS totalLockDisplayed,
      COALESCE((SELECT COUNT(*) FROM lock_events WHERE event_type='unlock_clicked'
        AND created_at >= ?1 AND created_at < ?2), 0) AS totalUnlockClicked,
      COALESCE((SELECT COUNT(*) FROM lock_events WHERE event_type='abandoned'
        AND created_at >= ?1 AND created_at < ?2), 0) AS totalAbandoned
  `).bind(fromMs, toMs).first<{
    totalUserTarget: number
    totalCompleted: number
    pausedCount: number
    totalWrongEntries: number
    totalLockDisplayed: number
    totalUnlockClicked: number
    totalAbandoned: number
  }>()

  const totalUserTarget = row?.totalUserTarget ?? 0
  const totalCompleted = row?.totalCompleted ?? 0
  const totalLockDisplayed = row?.totalLockDisplayed ?? 0
  const totalMissing = Math.max(0, totalUserTarget - totalCompleted)
  const conversionRate = totalLockDisplayed > 0 ? totalCompleted / totalLockDisplayed : 0

  return c.json({
    totalUserTarget,
    totalCompleted,
    totalMissing,
    pausedCount: row?.pausedCount ?? 0,
    totalWrongEntries: row?.totalWrongEntries ?? 0,
    totalLockDisplayed,
    totalUnlockClicked: row?.totalUnlockClicked ?? 0,
    totalAbandoned: row?.totalAbandoned ?? 0,
    conversionRate,
  })
})

type CampaignLockRow = {
  id: string
  code: string
  name: string
  status: string
  keyword: string | null
  passCode: string | null
  targetUrl: string | null
  dailyUserTarget: number
  priority: string | null
  maxWrongAttempts: number | null
  createdAt: string
  parentCategoryId: string | null
  childCategoryId: string | null
  assignedTo: string | null
  assignedToName: string | null
  lockDisplayed: number
  unlockClicked: number
  targetClicked: number
  passAttempted: number
  passValid: number
  passInvalid: number
  unlocked: number
  abandoned: number
}

const CAMPAIGN_SELECT_FIELDS = `
    c.id, c.code, c.name, c.status,
    c.keyword,
    c.pass_code AS passCode,
    c.target_url AS targetUrl,
    COALESCE(c.daily_user_target, 0) AS dailyUserTarget,
    c.priority,
    c.max_wrong_attempts AS maxWrongAttempts,
    c.created_at AS createdAt,
    c.parent_category_id AS parentCategoryId,
    c.child_category_id AS childCategoryId,
    c.assigned_to AS assignedTo,
    u.name AS assignedToName,
    COALESCE(SUM(CASE WHEN e.event_type='lock_displayed' THEN 1 ELSE 0 END), 0) AS lockDisplayed,
    COALESCE(SUM(CASE WHEN e.event_type='unlock_clicked' THEN 1 ELSE 0 END), 0) AS unlockClicked,
    COALESCE(SUM(CASE WHEN e.event_type='target_clicked' THEN 1 ELSE 0 END), 0) AS targetClicked,
    COALESCE(SUM(CASE WHEN e.event_type='pass_attempted' THEN 1 ELSE 0 END), 0) AS passAttempted,
    COALESCE(SUM(CASE WHEN e.event_type='pass_valid' THEN 1 ELSE 0 END), 0) AS passValid,
    COALESCE(SUM(CASE WHEN e.event_type='pass_invalid' THEN 1 ELSE 0 END), 0) AS passInvalid,
    COALESCE(SUM(CASE WHEN e.event_type='unlocked' THEN 1 ELSE 0 END), 0) AS unlocked,
    COALESCE(SUM(CASE WHEN e.event_type='abandoned' THEN 1 ELSE 0 END), 0) AS abandoned
`

const CAMPAIGN_GROUP_BY = `
  GROUP BY c.id, c.code, c.name, c.status, c.keyword, c.pass_code, c.target_url,
    c.daily_user_target, c.priority, c.max_wrong_attempts, c.created_at,
    c.parent_category_id, c.child_category_id, c.assigned_to, u.name
`

const CAMPAIGNS_SQL = `
  SELECT ${CAMPAIGN_SELECT_FIELDS}
  FROM campaigns c
  LEFT JOIN users u ON u.id = c.assigned_to
  LEFT JOIN lock_sessions s ON s.campaign_id = c.id
    AND s.started_at >= ?1 AND s.started_at < ?2
  LEFT JOIN lock_events e ON e.session_id = s.id
  ${CAMPAIGN_GROUP_BY}
  ORDER BY c.created_at DESC
`

function withConversionRate(row: CampaignLockRow, currentUserId: string, currentUserRole: string) {
  return {
    ...row,
    isOwner: currentUserRole === 'admin' || row.assignedTo === currentUserId,
    conversionRate: row.lockDisplayed > 0 ? row.unlocked / row.lockDisplayed : 0,
  }
}

// GET /campaigns
statsLockRoutes.get('/campaigns', async (c) => {
  const { fromMs, toMs } = parseRange(c.req.query())
  const result = await c.env.DB.prepare(CAMPAIGNS_SQL).bind(fromMs, toMs).all<CampaignLockRow>()
  const userId = c.get('userId')
  const userRole = c.get('userRole')
  return c.json(result.results.map((row) => withConversionRate(row, userId, userRole)))
})

// GET /campaigns/:id
statsLockRoutes.get('/campaigns/:id', async (c) => {
  const campaignId = c.req.param('id')
  const { fromMs, toMs } = parseRange(c.req.query())

  const row = await c.env.DB.prepare(`
    SELECT ${CAMPAIGN_SELECT_FIELDS}
    FROM campaigns c
    LEFT JOIN users u ON u.id = c.assigned_to
    LEFT JOIN lock_sessions s ON s.campaign_id = c.id
      AND s.started_at >= ?1 AND s.started_at < ?2
    LEFT JOIN lock_events e ON e.session_id = s.id
    WHERE c.id = ?3
    ${CAMPAIGN_GROUP_BY}
  `).bind(fromMs, toMs, campaignId).first<CampaignLockRow>()

  if (!row) return c.json({ error: 'Campaign not found' }, 404)
  const userId = c.get('userId')
  const userRole = c.get('userRole')
  return c.json(withConversionRate(row, userId, userRole))
})
