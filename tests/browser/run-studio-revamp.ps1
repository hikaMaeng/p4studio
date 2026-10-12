param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Out = 'tests/reports/studio-revamp/browser'
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class StudioBrowserErrorMode {
  [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
}
'@
# 자식 프로세스에 상속한다. 전역 WER/레지스트리 설정은 바꾸지 않는다.
$previousMode = [StudioBrowserErrorMode]::SetErrorMode(0x8003)
try {
  if (-not $env:HEADLESS_BROWSER_EXECUTABLE) {
    $env:HEADLESS_BROWSER_EXECUTABLE = & node -e "console.log(require(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT).chromium.executablePath())"
    if ($LASTEXITCODE -ne 0) { throw 'Chromium 경로 확인 실패' }
  }
  # 테스트 전용 Chromium 경로만 세며 사용자의 Chrome/WebView는 건드리지 않는다.
  $taskBrowser = (Get-Item -LiteralPath $env:HEADLESS_BROWSER_EXECUTABLE).FullName
  $env:HEADLESS_BROWSER_EXECUTABLE = $taskBrowser
  $browserBefore = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $taskBrowser }).Count
  if ($browserBefore -ne 0) { throw '같은 테스트 Chromium 실행 파일이 이미 사용 중입니다' }
  $werBefore = @(Get-Process WerFault,WerFaultSecure -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  & node tests/browser/studio-revamp.mjs --url $Url --out $Out
  $scenarioExit = $LASTEXITCODE
  $browserAfter = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $taskBrowser }).Count
  $newWer = @(Get-Process WerFault,WerFaultSecure -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $werBefore })
  $report = @{ executable=$taskBrowser; errorMode='0x8003'; browserBefore=$browserBefore; browserAfter=$browserAfter;
    newWerFaultCount=$newWer.Count; scenarioExit=$scenarioExit; userBrowserTouched=$false }
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Out 'process-report.json') -Encoding UTF8
  $report | ConvertTo-Json
  if ($browserAfter -ne 0 -or $newWer.Count -ne 0) { throw '브라우저 잔류 프로세스 또는 새 WER 프로세스 확인 필요' }
  exit $scenarioExit
} finally {
  [void][StudioBrowserErrorMode]::SetErrorMode($previousMode)
}
