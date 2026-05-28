# Test scenarios cho setting #4 limitWrongPass.
. $PSScriptRoot/_helpers.ps1

$results = @()

# 4.1 — limitWrongPass=false → no alert dù vượt ngưỡng
$id = New-TestCampaign -MaxWrongAttempts 3
Set-CampaignSettings -Id $id -Settings @{ limit_wrong_pass = $false }
Track-Event -CampaignId $id -Type 'pass_invalid' -Times 5
$results += Assert-NoAlert -CampaignId $id -Type 'wrong_pass_exceeded' `
  -TestName "4.1 limitWrongPass=false + 5x invalid (max=3) -> no alert"
Remove-TestCampaign -Id $id

# 4.2 — limitWrongPass=true → fire alert khi vượt ngưỡng
$id = New-TestCampaign -MaxWrongAttempts 3
Set-CampaignSettings -Id $id -Settings @{ limit_wrong_pass = $true }
Track-Event -CampaignId $id -Type 'pass_invalid' -Times 4
$results += Assert-AlertExists -CampaignId $id -Type 'wrong_pass_exceeded' -Count 1 `
  -TestName "4.2 limitWrongPass=true + 4x invalid (max=3) -> 1 alert"
Remove-TestCampaign -Id $id

# 4.3 — Dedup: 1 alert/day dù fire nhiều lần
$id = New-TestCampaign -MaxWrongAttempts 3
Set-CampaignSettings -Id $id -Settings @{ limit_wrong_pass = $true }
Track-Event -CampaignId $id -Type 'pass_invalid' -Times 6
$results += Assert-AlertExists -CampaignId $id -Type 'wrong_pass_exceeded' -Count 1 `
  -TestName "4.3 limitWrongPass=true + 6x invalid -> still 1 alert (dedup)"
Remove-TestCampaign -Id $id

return $results
