import { createMiddleware } from 'hono/factory'
import { createDb } from '../db/client'
import { userPermissions } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { AppEnv, Permission } from '../lib/types'

export function requirePermission(...perms: Permission[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const role = c.get('userRole')

    // Admin bypass — full access
    if (role === 'admin') return next()

    const userId = c.get('userId')
    const db = createDb(c.env.DB)

    const userPerms = await db
      .select({ permission: userPermissions.permission })
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId))

    const permSet = new Set(userPerms.map((p) => p.permission))
    const hasAll = perms.every((p) => permSet.has(p))

    if (!hasAll) {
      return c.json({ error: 'Forbidden', required: perms }, 403)
    }

    await next()
  })
}
