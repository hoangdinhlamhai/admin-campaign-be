# Test scenarios cho setting #2 notifyCampaignPaused (manual pause + helper).
. $PSScriptRoot/_helpers.ps1

$results = @()

# 2.1 — notifyCampaignPaused=false -> status=paused, no alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ notify_campaign_paused = $false }
Invoke-Api -Method POST -Path "/api/campaigns/$id/pause" | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "2.1 notifyOFF -> status=paused"
$results += Assert-NoAlert -CampaignId $id -Type 'campaign_paused' `
  -TestName "2.1 notifyOFF -> no alert"
Remove-TestCampaign -Id $id

# 2.2 — notifyCampaignPaused=true -> status=paused, 1 alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ notify_campaign_paused = $true }
Invoke-Api -Method POST -Path "/api/campaigns/$id/pause" | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "2.2 notifyON -> status=paused"
$results += Assert-AlertExists -CampaignId $id -Type 'campaign_paused' -Count 1 `
  -TestName "2.2 notifyON -> 1 campaign_paused alert"
Remove-TestCampaign -Id $id

# 2.3 — Dedup: pause × 2 -> still 1 alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ notify_campaign_paused = $true }
Invoke-Api -Method POST -Path "/api/campaigns/$id/pause" | Out-Null
# Reset to active để pause lần 2
Invoke-D1 "UPDATE campaigns SET status='active' WHERE id='$id'" | Out-Null
Invoke-Api -Method POST -Path "/api/campaigns/$id/pause" | Out-Null
$results += Assert-AlertExists -CampaignId $id -Type 'campaign_paused' -Count 1 `
  -TestName "2.3 pause x 2 -> still 1 alert (dedup)"
Remove-TestCampaign -Id $id

return $results
