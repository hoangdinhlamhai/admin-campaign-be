import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import {
  campaigns,
  campaignInstructions,
  campaignSettings,
  parentCategories,
} from '../src/db/schema'

const SEED_CAMPAIGNS = [
  { id: 'camp-lock-1', code: 'LOCK-001', name: 'Quiz Toán Lớp 5', passCode: '1234', targetUrl: 'https://example.com' },
  { id: 'camp-lock-2', code: 'LOCK-002', name: 'Quiz Tiếng Anh', passCode: '5678', targetUrl: 'https://www.google.com' },
  { id: 'camp-lock-3', code: 'LOCK-003', name: 'Quiz Văn Học', passCode: '9999', targetUrl: 'https://github.com' },
]

const SAMPLE_INSTRUCTIONS = `<h2>Hướng dẫn lấy mã mở khoá</h2>
<p>Để xem kết quả, bạn vui lòng làm theo các bước sau:</p>
<ol>
  <li>Click vào nút "Đi lấy mã" bên dưới</li>
  <li>Tab mới sẽ mở ra trang đối tác</li>
  <li>Tìm mã 4 số trên trang đó (thường ở đầu hoặc cuối bài)</li>
  <li>Quay lại đây và nhập mã để mở khoá</li>
</ol>
<p><strong>Lưu ý:</strong> Bạn có 5 lần thử. Sau 30 phút mã sẽ hết hạn.</p>`

export async function seedLockTest(env: { DB: D1Database }) {
  const db = createDb(env.DB)

  const parent = await db.select({ id: parentCategories.id }).from(parentCategories).limit(1).get()
  if (!parent) throw new Error('No parent categories found — run base seed first (POST /api/dev/seed)')

  const result: { seeded: number; skipped: number; details: Array<{ code: string; status: string; passCode?: string }> } = {
    seeded: 0,
    skipped: 0,
    details: [],
  }

  for (const c of SEED_CAMPAIGNS) {
    const existing = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, c.id)).get()
    if (existing) {
      result.skipped++
      result.details.push({ code: c.code, status: 'already_exists' })
      continue
    }

    await db.insert(campaigns).values({
      id: c.id,
      code: c.code,
      parentCategoryId: parent.id,
      name: c.name,
      targetUrl: c.targetUrl,
      passCode: c.passCode,
      dailyUserTarget: 100,
      priority: 'medium',
      status: 'active',
    }).run()

    await db.insert(campaignInstructions).values({
      id: `inst-${c.id}`,
      campaignId: c.id,
      contentHtml: SAMPLE_INSTRUCTIONS,
      contentJson: null,
      version: 1,
    }).run()

    await db.insert(campaignSettings).values({
      campaignId: c.id,
      maxWrongPassAttempts: 5,
      limitWrongPass: true,
    }).run()

    result.seeded++
    result.details.push({ code: c.code, status: 'created', passCode: c.passCode })
  }

  return result
}
