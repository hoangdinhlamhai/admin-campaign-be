# Test scenarios cho setting #1 notifyLowUsers (cron daily evaluator).
. $PSScriptRoot/_helpers.ps1

$results = @()
$today = Today-VN

# 1.1 — notifyLowUsers=false -> no alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{
  notify_low_users = $false
  low_users_threshold = 10
}
Set-DailyStats -CampaignId $id -Date $today -Completed 2
Invoke-Api -Method POST -Path '/api/dev/run-daily-evaluator' | Out-Null
$results += Assert-NoAlert -CampaignId $id -Type 'low_users' `
  -TestName "1.1 notifyLowUsers=false + completed=2/10 -> no alert"
Remove-TestCampaign -Id $id

# 1.2 — notifyLowUsers=true + below threshold -> 1 alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{
  notify_low_users = $true
  low_users_threshold = 10
}
Set-DailyStats -CampaignId $id -Date $today -Completed 2
Invoke-Api -Method POST -Path '/api/dev/run-daily-evaluator' | Out-Null
$results += Assert-AlertExists -CampaignId $id -Type 'low_users' -Count 1 `
  -TestName "1.2 notifyLowUsers=true + completed=2/10 -> 1 alert"
Remove-TestCampaign -Id $id

# 1.3 — At/above threshold -> no alert
$id = New-TestCampaign -Status 'active'
Set-CampaignSettings -Id $id -Settings @{
  notify_low_users = $true
  low_users_threshold = 10
}
Set-DailyStats -CampaignId $id -Date $today -Completed 10
Invoke-Api -Method POST -Path '/api/dev/run-daily-evaluator' | Out-Null
$results += Assert-NoAlert -CampaignId $id -Type 'low_users' `
  -TestName "1.3 completed=10 (at threshold) -> no alert"
Remove-TestCampaign -Id $id

return $results
