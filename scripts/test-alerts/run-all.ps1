# Master runner cho alert evaluators test suite.
# Pre-requisite: BE running at http://localhost:8787
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

. $PSScriptRoot/_helpers.ps1

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Alert Evaluators Test Suite" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Pre-flight: BE health
try {
  Invoke-RestMethod -Uri "$BASE_URL/health" -Method GET -TimeoutSec 3 | Out-Null
  Write-Host "BE healthy at $BASE_URL" -ForegroundColor Green
} catch {
  Write-Host "BE not running. Start with: cd admin-campaign-be && pnpm dev" -ForegroundColor Red
  exit 2
}

# Cleanup leftover from previous runs
Write-Host "Cleanup leftover test campaigns..." -ForegroundColor Yellow
Remove-AllTestCampaigns
Write-Host "Done." -ForegroundColor Yellow

$allResults = @()
$start = Get-Date

$scripts = @(
  @{ Name = "Setting #4 limitWrongPass"; Path = "$PSScriptRoot/test-wrong-pass.ps1" }
  @{ Name = "Setting #5 pauseOnNoValidEntry"; Path = "$PSScriptRoot/test-no-valid-entry.ps1" }
  @{ Name = "Setting #1 notifyLowUsers"; Path = "$PSScriptRoot/test-low-users.ps1" }
  @{ Name = "Setting #2 notifyCampaignPaused"; Path = "$PSScriptRoot/test-campaign-paused.ps1" }
  @{ Name = "Setting #3 autoReactivateNextDay"; Path = "$PSScriptRoot/test-auto-reactivate.ps1" }
)

foreach ($s in $scripts) {
  Write-Host ""
  Write-Host "--- $($s.Name) ---" -ForegroundColor Cyan
  try {
    $r = & $s.Path
    if ($r) { $allResults += $r }
  } catch {
    Write-Host "  [ERROR] Script failed: $($_.Exception.Message)" -ForegroundColor Red
    $allResults += [PSCustomObject]@{ Name = $s.Name; Pass = $false; Detail = $_.Exception.Message }
  }
}

$elapsed = ((Get-Date) - $start).TotalSeconds
$passed = ($allResults | Where-Object { $_.Pass }).Count
$failed = ($allResults | Where-Object { -not $_.Pass }).Count
$total = $allResults.Count

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Results" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Passed: $passed/$total" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "  Time:   $([math]::Round($elapsed, 1))s"
Write-Host ""

if ($failed -gt 0) {
  Write-Host "Failures:" -ForegroundColor Red
  $allResults | Where-Object { -not $_.Pass } | ForEach-Object {
    Write-Host "  - $($_.Name)" -ForegroundColor Red
    if ($_.Detail) { Write-Host "    $($_.Detail)" -ForegroundColor Red }
  }
  exit 1
}

Write-Host "All tests passed." -ForegroundColor Green
exit 0
