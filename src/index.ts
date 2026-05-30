import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { parentCategoryRoutes } from './routes/parent-categories'
import { childCategoryRoutes } from './routes/child-categories'
import { campaignRoutes } from './routes/campaigns'
import { alertRoutes } from './routes/alerts'
import { statsRoutes } from './routes/stats'
import { settingsRoutes } from './routes/settings'
import { mediaRoutes } from './routes/media'
import { trackRoutes } from './routes/track'
import { createDb } from './db/client'
import { seed } from './db/seed'
import { runDailyEvaluator } from './lib/alerts/evaluators/low-users'
import { runAutoReactivate } from './lib/alerts/evaluators/auto-reactivate'
import { evaluateTargetReached } from './lib/alerts/evaluators/target-reached'
import { expireSessions } from './lib/lock/expire-sessions'
import { seedLockTest } from '../scripts/seed-lock-test'
import { isOriginAllowed } from './middleware/origin'
import type { AppEnv, AppBindings } from './lib/types'

const app = new Hono<AppEnv>()

// ─── Global middleware ───
app.use('*', logger())
app.use('/api/*', cors({
  origin: (origin, c) => {
    if (!origin) return undefined
    return isOriginAllowed(origin, c.env.CORS_ALLOWED_ORIGINS) ? origin : undefined
  },
  credentials: true,
}))

// ─── Public routes ───
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))
app.route('/api/auth', authRoutes)

// ─── Protected API routes ───
app.route('/api/users', userRoutes)
app.route('/api/parent-categories', parentCategoryRoutes)
app.route('/api/child-categories', childCategoryRoutes)
app.route('/api/campaigns', campaignRoutes)
app.route('/api/alerts', alertRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/media', mediaRoutes)
app.route('/api/track', trackRoutes)

// ─── Content Lock routes ───
import { lockRoutes } from './routes/lock'
import { eventsRoutes } from './routes/events'
import { statsLockRoutes } from './routes/stats-lock'
app.route('/api/v1/lock', lockRoutes)
app.route('/api/v1/events', eventsRoutes)
app.route('/api/v1/stats', statsLockRoutes)

// ─── Dev-only: seed database ───
// ─── Dev-only: reset & re-seed database ───
app.post('/api/dev/reset', async (c) => {
  const db = createDb(c.env.DB)
  try {
    // Clear all tables (order matters for FK constraints)
    const tables = [
      'audit_logs', 'alerts_meta', 'alerts', 'campaign_ad_daily_stats', 'ad_sources',
      'category_daily_stats', 'campaign_daily_stats', 'campaign_attempts',
      'lock_events', 'lock_sessions',
      'campaign_settings', 'campaign_instruction_versions', 'campaign_instructions',
      'media_assets', 'campaigns', 'child_categories', 'parent_categories',
      'user_permissions', 'global_settings', 'users',
    ]
    for (const table of tables) {
      await c.env.DB.prepare(`DELETE FROM ${table}`).run()
    }
    const result = await seed(db)
    return c.json({ ok: true, reset: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/dev/seed', async (c) => {
  const db = createDb(c.env.DB)
  try {
    const result = await seed(db)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/dev/seed-lock-test', async (c) => {
  try {
    const result = await seedLockTest(c.env)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Dev-only: manually trigger expire-sessions cron (same logic as cron */5).
app.post('/api/dev/run-expire-sessions', async (c) => {
  const db = createDb(c.env.DB)
  try {
    const result = await expireSessions(db)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Dev-only: manually trigger the daily evaluator (same logic as cron).
app.post('/api/dev/run-daily-evaluator', async (c) => {
  const db = createDb(c.env.DB)
  try {
    const result = await runDailyEvaluator(db)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Dev-only: manually trigger the auto-reactivate scan (same logic as cron).
app.post('/api/dev/run-auto-reactivate', async (c) => {
  const db = createDb(c.env.DB)
  try {
    const result = await runAutoReactivate(db)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Dev-only: manually trigger target-reached evaluator for a specific campaign.
// Used for QA/E2E testing without depending on real tracker traffic.
app.post('/api/dev/run-target-reached/:campaignId', async (c) => {
  const db = createDb(c.env.DB)
  const campaignId = c.req.param('campaignId')
  const today = new Date().toISOString().slice(0, 10)
  try {
    const result = await evaluateTargetReached(db, c.env, c.executionCtx, campaignId, today)
    return c.json({ ok: true, ...result })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: AppBindings, ctx: ExecutionContext) {
    const db = createDb(env.DB)
    const cron = event.cron

    if (cron === '*/5 * * * *') {
      ctx.waitUntil(
        expireSessions(db)
          .then((r) => console.log('[cron] expire sessions', r))
          .catch((err) => console.error('[cron] expire sessions failed', err)),
      )
      return
    }

    ctx.waitUntil(
      runDailyEvaluator(db)
        .then((r) => console.log('[cron] daily evaluator', r))
        .catch((err) => console.error('[cron] daily evaluator failed', err)),
    )
    ctx.waitUntil(
      runAutoReactivate(db)
        .then((r) => console.log('[cron] auto-reactivate', r))
        .catch((err) => console.error('[cron] auto-reactivate failed', err)),
    )
  },
} satisfies ExportedHandler<AppBindings>
