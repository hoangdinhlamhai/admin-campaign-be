import { eq } from 'drizzle-orm'
import { campaigns, campaignSettings } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'

export type PauseReason = 'manual' | 'no_valid_entry' | 'auto'

const REASON_LABEL: Record<PauseReason, string> = {
  manual: 'Đã tạm dừng thủ công.',
  no_valid_entry: 'Tự dừng do hiển thị nhiều lần nhưng không có lượt nhập hợp lệ.',
  auto: 'Tự động tạm dừng theo rule.',
}

// Emit campaign_paused alert if setting `notifyCampaignPaused` is enabled.
// Returns alert id, or null if dedup hit / setting disabled.
export async function emitCampaignPausedAlert(
  db: Database,
  campaignId: string,
  reason: PauseReason,
): Promise<string | null> {
  const row = await db.select({
    name: campaigns.name,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
    notify: campaignSettings.notifyCampaignPaused,
  })
    .from(campaigns)
    .leftJoin(campaignSettings, eq(campaignSettings.campaignId, campaigns.id))
    .where(eq(campaigns.id, campaignId))
    .get()

  if (!row?.notify) return null

  return emitAlert(db, {
    campaignId,
    parentCategoryId: row.parentCategoryId ?? null,
    childCategoryId: row.childCategoryId ?? null,
    type: 'campaign_paused',
    severity: 'info',
    title: `Tạm dừng chiến dịch: ${row.name ?? campaignId}`,
    description: REASON_LABEL[reason],
  })
}
