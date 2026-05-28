import { eq } from 'drizzle-orm'
import { campaigns } from '../../../db/schema'
import type { Database } from '../../../db/client'
import { emitAlert } from '../evaluate'
import { resolveCampaignSettings } from '../../settings/resolve-campaign-setting'
import type { GlobalSettingsMap } from '../../settings/load-global-settings'

export type PauseReason = 'manual' | 'no_valid_entry' | 'auto'

const REASON_LABEL: Record<PauseReason, string> = {
  manual: 'Đã tạm dừng thủ công.',
  no_valid_entry: 'Tự dừng do hiển thị nhiều lần nhưng không có lượt nhập hợp lệ.',
  auto: 'Tự động tạm dừng theo rule.',
}

// Emit campaign_paused alert if effective setting `notifyCampaignPaused` is enabled.
// Returns alert id, or null if dedup hit / setting disabled.
export async function emitCampaignPausedAlert(
  db: Database,
  campaignId: string,
  reason: PauseReason,
  globalsCache?: GlobalSettingsMap,
): Promise<string | null> {
  const settings = await resolveCampaignSettings(db, campaignId, globalsCache)
  if (!settings.notifyCampaignPaused) return null

  const camp = await db.select({
    name: campaigns.name,
    parentCategoryId: campaigns.parentCategoryId,
    childCategoryId: campaigns.childCategoryId,
  })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get()

  return emitAlert(db, {
    campaignId,
    parentCategoryId: camp?.parentCategoryId ?? null,
    childCategoryId: camp?.childCategoryId ?? null,
    type: 'campaign_paused',
    severity: 'info',
    title: `Tạm dừng chiến dịch: ${camp?.name ?? campaignId}`,
    description: REASON_LABEL[reason],
  })
}
