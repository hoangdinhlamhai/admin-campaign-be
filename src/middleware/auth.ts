import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { AppEnv } from '../lib/types'

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization')

  // DEV MODE: skip auth if no token — default to admin
  // TODO: Remove this bypass before production
  if (!header?.startsWith('Bearer ')) {
    c.set('userId', 'dev-admin')
    c.set('userRole', 'admin')
    return next()
  }

  const token = header.slice(7)
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('userId', payload.sub as string)
    c.set('userRole', payload.role as 'admin' | 'employee')
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
