# Test scenarios cho setting #5 pauseOnNoValidEntry + auto-pause.
. $PSScriptRoot/_helpers.ps1

$results = @()

# 5.1 — pauseOnNoValidEntry=false -> no alert, no pause
$id = New-TestCampaign
Set-CampaignSettings -Id $id -Settings @{
  pause_on_no_valid_entry = $false
  no_valid_entry_displays = 3
}
Track-Event -CampaignId $id -Type 'displayed' -Times 5
$results += Assert-NoAlert -CampaignId $id -Type 'no_valid_entry' `
  -TestName "5.1 pauseOnNoValidEntry=false -> no alert"
$results += Assert-Status -CampaignId $id -Expected 'active' `
  -TestName "5.1 pauseOnNoValidEntry=false -> status=active"
Remove-TestCampaign -Id $id

# 5.2 — pauseON + notifyPausedON -> 2 alerts, status=paused
$id = New-TestCampaign
Set-CampaignSettings -Id $id -Settings @{
  pause_on_no_valid_entry = $true
  no_valid_entry_displays = 3
  notify_campaign_paused = $true
}
Track-Event -CampaignId $id -Type 'displayed' -Times 3
$results += Assert-AlertExists -CampaignId $id -Type 'no_valid_entry' -Count 1 `
  -TestName "5.2 pauseON + notifyON -> 1 no_valid_entry alert"
$results += Assert-AlertExists -CampaignId $id -Type 'campaign_paused' -Count 1 `
  -TestName "5.2 pauseON + notifyON -> 1 campaign_paused alert"
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "5.2 pauseON + notifyON -> status=paused"
Remove-TestCampaign -Id $id

# 5.3 — pauseON + notifyPausedOFF -> 1 alert, status=paused
$id = New-TestCampaign
Set-CampaignSettings -Id $id -Settings @{
  pause_on_no_valid_entry = $true
  no_valid_entry_displays = 3
  notify_campaign_paused = $false
}
Track-Event -CampaignId $id -Type 'displayed' -Times 3
$results += Assert-AlertExists -CampaignId $id -Type 'no_valid_entry' -Count 1 `
  -TestName "5.3 pauseON + notifyOFF -> 1 no_valid_entry alert"
$results += Assert-NoAlert -CampaignId $id -Type 'campaign_paused' `
  -TestName "5.3 pauseON + notifyOFF -> no campaign_paused alert"
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "5.3 pauseON + notifyOFF -> status=paused"
Remove-TestCampaign -Id $id

# 5.4 — has valid entry -> no alert
$id = New-TestCampaign
Set-CampaignSettings -Id $id -Settings @{
  pause_on_no_valid_entry = $true
  no_valid_entry_displays = 3
}
Track-Event -CampaignId $id -Type 'pass_valid' -Times 1
Track-Event -CampaignId $id -Type 'displayed' -Times 5
$results += Assert-NoAlert -CampaignId $id -Type 'no_valid_entry' `
  -TestName "5.4 has valid entry -> no alert"
$results += Assert-Status -CampaignId $id -Expected 'active' `
  -TestName "5.4 has valid entry -> status=active"
Remove-TestCampaign -Id $id

return $results
