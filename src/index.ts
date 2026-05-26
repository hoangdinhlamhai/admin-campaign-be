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
import { authMiddleware } from './middleware/auth'
import { createDb } from './db/client'
import { seed } from './db/seed'
import type { AppEnv } from './lib/types'

const app = new Hono<AppEnv>()

// ─── Global middleware ───
app.use('*', logger())
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'https://admin.senlyzer.io'],
  credentials: true,
}))

// ─── Public routes ───
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))
app.route('/api/auth', authRoutes)

// ─── Protected routes (auth required for /me) ───
app.use('/api/auth/me', authMiddleware)

// ─── Protected API routes ───
app.route('/api/users', userRoutes)
app.route('/api/parent-categories', parentCategoryRoutes)
app.route('/api/child-categories', childCategoryRoutes)
app.route('/api/campaigns', campaignRoutes)
app.route('/api/alerts', alertRoutes)
app.route('/api/stats', statsRoutes)

// ─── Dev-only: seed database ───
// ─── Dev-only: reset & re-seed database ───
app.post('/api/dev/reset', async (c) => {
  const db = createDb(c.env.DB)
  try {
    // Clear all tables (order matters for FK constraints)
    const tables = [
      'audit_logs', 'alerts', 'campaign_ad_daily_stats', 'ad_sources',
      'category_daily_stats', 'campaign_daily_stats', 'campaign_attempts',
      'campaign_settings', 'campaign_instruction_versions', 'campaign_instructions',
      'media_assets', 'campaigns', 'child_categories', 'parent_categories',
      'user_permissions', 'users',
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

export default app
