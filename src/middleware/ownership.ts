import { createMiddleware } from 'hono/factory'
import { createDb } from '../db/client'
import { campaigns } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../lib/types'

export function requireCampaignOwnerOrAdmin() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('userRole') === 'admin') return next()

    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!id) {
      return c.json({ error: 'Missing campaign id' }, 400)
    }

    const db = createDb(c.env.DB)
    const camp = await db
      .select({ assignedTo: campaigns.assignedTo })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .get()

    if (!camp) return c.json({ error: 'Not found' }, 404)
    if (camp.assignedTo !== userId) {
      return c.json({ error: 'Forbidden — not the assignee' }, 403)
    }
    return next()
  })
}
