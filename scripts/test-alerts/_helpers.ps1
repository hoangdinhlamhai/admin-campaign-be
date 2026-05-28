# Shared PowerShell helpers for alert evaluator tests.
# Source via: . $PSScriptRoot/_helpers.ps1

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$BASE_URL = "http://localhost:8787"
$DB_NAME = "admin-campaign-db"
$TEST_PREFIX = "test-alert-"

function Invoke-Api {
  param([string]$Method, [string]$Path, $Body = $null)
  $url = "$BASE_URL$Path"
  $params = @{
    Uri = $url
    Method = $Method
    ContentType = 'application/json'
    TimeoutSec = 10
  }
  if ($Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod @params
}

function Invoke-D1 {
  param([string]$Sql)
  $cmd = "wrangler d1 execute $DB_NAME --local --command `"$Sql`" --json"
  $output = Invoke-Expression $cmd 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler d1 failed: $Sql"
  }
  try {
    return ($output | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-FirstParentCategory {
  $rows = Invoke-D1 "SELECT id FROM parent_categories LIMIT 1"
  $row = $rows[0].results[0]
  if (-not $row) { throw "No parent category found. Seed DB first." }
  return $row.id
}

function New-TestCampaign {
  param(
    [int]$MaxWrongAttempts = 0,
    [int]$DailyUserTarget = 100,
    [string]$Status = 'active'
  )
  $parentId = Get-FirstParentCategory
  $rand = [guid]::NewGuid().ToString().Substring(0, 8)
  $body = @{
    parentCategoryId = $parentId
    name = "$TEST_PREFIX$rand"
    keyword = "test"
    dailyUserTarget = $DailyUserTarget
    maxWrongAttempts = if ($MaxWrongAttempts -gt 0) { $MaxWrongAttempts } else { $null }
    status = $Status
    instructions = @{ contentHtml = "<p>test</p>" }
    settings = @{}
  }
  $r = Invoke-Api -Method POST -Path '/api/campaigns/full' -Body $body
  # If status='active' wanted but POST forced to draft when not 'active', publish it.
  if ($Status -eq 'active') {
    Invoke-D1 "UPDATE campaigns SET status='active' WHERE id='$($r.id)'" | Out-Null
  }
  return $r.id
}

function Set-CampaignSettings {
  param([string]$Id, [hashtable]$Settings)
  # Map camelCase keys to snake_case columns and run UPDATE
  $map = @{
    notify_low_users = 'notifyLowUsers'
    low_users_threshold = 'lowUsersThreshold'
    notify_campaign_paused = 'notifyCampaignPaused'
    auto_reactivate_next_day = 'autoReactivateNextDay'
    limit_wrong_pass = 'limitWrongPass'
    max_wrong_pass_attempts = 'maxWrongPassAttempts'
    pause_on_no_valid_entry = 'pauseOnNoValidEntry'
    no_valid_entry_displays = 'noValidEntryDisplays'
  }
  $assigns = @()
  foreach ($k in $Settings.Keys) {
    $col = $k
    $val = $Settings[$k]
    if ($val -is [bool]) {
      $sqlVal = if ($val) { 1 } else { 0 }
    } elseif ($null -eq $val) {
      $sqlVal = "NULL"
    } else {
      $sqlVal = $val
    }
    $assigns += "$col = $sqlVal"
  }
  $set = $assigns -join ", "
  Invoke-D1 "UPDATE campaign_settings SET $set WHERE campaign_id = '$Id'" | Out-Null
}

function Set-DailyStats {
  param(
    [string]$CampaignId,
    [string]$Date,
    [int]$Display = 0,
    [int]$Wrong = 0,
    [int]$Valid = 0,
    [int]$Completed = 0
  )
  $statId = [guid]::NewGuid().ToString()
  $sql = "INSERT OR REPLACE INTO campaign_daily_stats " +
    "(id, campaign_id, stat_date, display_count, wrong_entry_count, valid_entry_count, completed_count, daily_user_target) " +
    "VALUES ('$statId', '$CampaignId', '$Date', $Display, $Wrong, $Valid, $Completed, 100)"
  Invoke-D1 $sql | Out-Null
}

function Get-CampaignStatus {
  param([string]$Id)
  $rows = Invoke-D1 "SELECT status FROM campaigns WHERE id='$Id'"
  return $rows[0].results[0].status
}

function Find-Alert {
  param([string]$CampaignId, [string]$Type)
  $rows = Invoke-D1 "SELECT COUNT(*) as cnt FROM alerts WHERE campaign_id='$CampaignId' AND type='$Type'"
  return [int]$rows[0].results[0].cnt
}

function Backdate-Campaign {
  param([string]$Id, [string]$Date)
  Invoke-D1 "UPDATE campaigns SET updated_at='$Date 12:00:00' WHERE id='$Id'" | Out-Null
}

function Track-Event {
  param(
    [string]$CampaignId,
    [string]$Type,
    [int]$Times = 1
  )
  for ($i = 0; $i -lt $Times; $i++) {
    Invoke-Api -Method POST -Path '/api/track/attempt' -Body @{
      campaignId = $CampaignId
      eventType = $Type
    } | Out-Null
  }
}

function Remove-TestCampaign {
  param([string]$Id)
  Invoke-D1 "DELETE FROM alerts WHERE campaign_id='$Id'" | Out-Null
  Invoke-D1 "DELETE FROM campaign_attempts WHERE campaign_id='$Id'" | Out-Null
  Invoke-D1 "DELETE FROM campaign_daily_stats WHERE campaign_id='$Id'" | Out-Null
  Invoke-D1 "DELETE FROM campaign_settings WHERE campaign_id='$Id'" | Out-Null
  Invoke-D1 "DELETE FROM campaign_instructions WHERE campaign_id='$Id'" | Out-Null
  Invoke-D1 "DELETE FROM campaigns WHERE id='$Id'" | Out-Null
}

function Remove-AllTestCampaigns {
  $rows = Invoke-D1 "SELECT id FROM campaigns WHERE name LIKE '$TEST_PREFIX%'"
  $ids = @()
  if ($rows -and $rows[0].results) {
    $ids = $rows[0].results | ForEach-Object { $_.id }
  }
  foreach ($id in $ids) {
    Remove-TestCampaign -Id $id
  }
}

function Today-VN {
  return (Get-Date).ToUniversalTime().AddHours(7).ToString("yyyy-MM-dd")
}

function Yesterday-VN {
  return (Get-Date).ToUniversalTime().AddHours(7).AddDays(-1).ToString("yyyy-MM-dd")
}

function Write-TestResult {
  param([string]$Name, [bool]$Pass, [string]$Detail = "")
  if ($Pass) {
    Write-Host "  [PASS] $Name" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] $Name" -ForegroundColor Red
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor Red }
  }
  return [PSCustomObject]@{ Name = $Name; Pass = $Pass; Detail = $Detail }
}

function Assert-AlertExists {
  param([string]$CampaignId, [string]$Type, [int]$Count = 1, [string]$TestName)
  $actual = Find-Alert -CampaignId $CampaignId -Type $Type
  $pass = $actual -eq $Count
  $detail = if ($pass) { "" } else { "expected $Count $Type, got $actual" }
  return Write-TestResult -Name $TestName -Pass $pass -Detail $detail
}

function Assert-NoAlert {
  param([string]$CampaignId, [string]$Type, [string]$TestName)
  $actual = Find-Alert -CampaignId $CampaignId -Type $Type
  $pass = $actual -eq 0
  $detail = if ($pass) { "" } else { "expected 0 $Type, got $actual" }
  return Write-TestResult -Name $TestName -Pass $pass -Detail $detail
}

function Assert-Status {
  param([string]$CampaignId, [string]$Expected, [string]$TestName)
  $actual = Get-CampaignStatus -Id $CampaignId
  $pass = $actual -eq $Expected
  $detail = if ($pass) { "" } else { "expected status='$Expected', got '$actual'" }
  return Write-TestResult -Name $TestName -Pass $pass -Detail $detail
}
