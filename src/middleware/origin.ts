import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../lib/types'

export function isOriginAllowed(origin: string | undefined, allowedRaw: string | undefined): boolean {
  if (!origin) return false
  const allowed = (allowedRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.some((pattern) => {
    if (pattern === origin) return true
    if (pattern.startsWith('regex:')) {
      try {
        return new RegExp(pattern.slice(6)).test(origin)
      } catch {
        return false
      }
    }
    return false
  })
}

export function requireWhitelistedOrigin() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const origin = c.req.header('Origin')
    if (!origin) {
      return c.json({ error: 'Forbidden: missing Origin' }, 403)
    }
    if (!isOriginAllowed(origin, c.env.CORS_ALLOWED_ORIGINS)) {
      return c.json({ error: 'Forbidden: origin not allowed' }, 403)
    }
    return next()
  })
}
