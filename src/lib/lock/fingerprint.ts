import type { Context } from 'hono'

export async function makeFingerprint(c: Context): Promise<string> {
  const ip =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For') ??
    'unknown'
  const ua = c.req.header('User-Agent') ?? 'unknown'
  const data = new TextEncoder().encode(`${ip}|${ua}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
