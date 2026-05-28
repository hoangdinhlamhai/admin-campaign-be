# Test scenarios cho setting #3 autoReactivateNextDay (cron daily).
. $PSScriptRoot/_helpers.ps1

$results = @()
$yesterday = Yesterday-VN

# 3.1 — autoReactivate=false, paused yesterday -> unchanged
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ auto_reactivate_next_day = $false }
Invoke-D1 "UPDATE campaigns SET status='paused' WHERE id='$id'" | Out-Null
Backdate-Campaign -Id $id -Date $yesterday
Invoke-Api -Method POST -Path '/api/dev/run-auto-reactivate' | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "3.1 autoOFF + paused yesterday -> still paused"
Remove-TestCampaign -Id $id

# 3.2 — autoReactivate=true, paused yesterday -> reactivated
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ auto_reactivate_next_day = $true }
Invoke-D1 "UPDATE campaigns SET status='paused' WHERE id='$id'" | Out-Null
Backdate-Campaign -Id $id -Date $yesterday
Invoke-Api -Method POST -Path '/api/dev/run-auto-reactivate' | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'active' `
  -TestName "3.2 autoON + paused yesterday -> status=active"
Remove-TestCampaign -Id $id

# 3.3 — autoReactivate=true, paused TODAY -> not reactivated
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ auto_reactivate_next_day = $true }
Invoke-Api -Method POST -Path "/api/campaigns/$id/pause" | Out-Null
Invoke-Api -Method POST -Path '/api/dev/run-auto-reactivate' | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'paused' `
  -TestName "3.3 autoON + paused TODAY -> still paused"
Remove-TestCampaign -Id $id

# 3.4 — autoReactivate=true, archived -> untouched
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{ auto_reactivate_next_day = $true }
Invoke-D1 "UPDATE campaigns SET status='archived' WHERE id='$id'" | Out-Null
Backdate-Campaign -Id $id -Date $yesterday
Invoke-Api -Method POST -Path '/api/dev/run-auto-reactivate' | Out-Null
$results += Assert-Status -CampaignId $id -Expected 'archived' `
  -TestName "3.4 archived -> status unchanged"
Remove-TestCampaign -Id $id

return $results
