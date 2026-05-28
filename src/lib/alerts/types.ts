export type AlertType = 'low_users' | 'no_valid_entry' | 'wrong_pass_exceeded' | 'campaign_paused'
export type AlertSeverity = 'info' | 'warning' | 'danger'

export type EmitAlertParams = {
  campaignId: string
  type: AlertType
  severity: AlertSeverity
  title: string
  description?: string
  parentCategoryId?: string | null
  childCategoryId?: string | null
}
