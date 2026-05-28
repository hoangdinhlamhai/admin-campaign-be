import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { mediaAssets } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { AppEnv } from '../lib/types'

export const mediaRoutes = new Hono<AppEnv>()

mediaRoutes.use('*', authMiddleware)

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
]

// POST /api/media/upload — multipart/form-data with `file` field
mediaRoutes.post('/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined

  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file provided' }, 400)
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 50MB)' }, 400)
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: `Unsupported file type: ${file.type}` }, 400)
  }

  const id = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = `campaigns/${id}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  await c.env.MEDIA.put(storageKey, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  })

  const publicUrl = `/api/media/${id}/file`
  const userId = c.get('userId')

  const db = createDb(c.env.DB)
  await db.insert(mediaAssets).values({
    id,
    ownerType: 'campaign_instruction',
    ownerId: '',
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storageKey,
    publicUrl,
    createdBy: userId === 'dev-admin' ? null : userId,
  })

  return c.json({ id, publicUrl }, 201)
})

// GET /api/media/:id/file — proxy R2 file
mediaRoutes.get('/:id/file', async (c) => {
  const id = c.req.param('id')
  const db = createDb(c.env.DB)
  const asset = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get()

  if (!asset) {
    return c.json({ error: 'Not found' }, 404)
  }

  const obj = await c.env.MEDIA.get(asset.storageKey)
  if (!obj) {
    return c.json({ error: 'File not found in storage' }, 404)
  }

  return new Response(obj.body, {
    headers: {
      'Content-Type': asset.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
