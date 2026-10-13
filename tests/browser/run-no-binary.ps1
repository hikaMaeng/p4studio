param([string]$Out = 'tests/reports/no-binary/browser')
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class NoBinaryBrowserErrorMode {
  [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
}
'@
# 자식에만 오류 대화상자 차단을 상속한다. 전역 WER·사용자 Chrome 설정은 변경하지 않는다.
$previousMode = [NoBinaryBrowserErrorMode]::SetErrorMode(0x8003)
try {
  if (-not $env:HEADLESS_BROWSER_EXECUTABLE) {
    $env:HEADLESS_BROWSER_EXECUTABLE = & node -e "console.log(require(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT).chromium.executablePath())"
    if ($LASTEXITCODE -ne 0) { throw 'Chromium 경로 확인 실패' }
  }
  $taskBrowser = (Get-Item -LiteralPath $env:HEADLESS_BROWSER_EXECUTABLE).FullName
  $env:HEADLESS_BROWSER_EXECUTABLE = $taskBrowser
  $browserBefore = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $taskBrowser }).Count
  if ($browserBefore -ne 0) { throw '같은 테스트 Chromium 실행 파일이 이미 사용 중입니다' }
  $werBefore = @(Get-Process WerFault,WerFaultSecure -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  & node --import tsx tests/browser/no-binary.mjs --url http://127.0.0.1:43181 --out $Out
  $scenarioExit = $LASTEXITCODE
  $browserAfter = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $taskBrowser }).Count
  $newWer = @(Get-Process WerFault,WerFaultSecure -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $werBefore })
  $report = @{ '실행파일'=$taskBrowser; '오류모드'='0x8003'; '시작전Chromium'=$browserBefore; '종료후Chromium'=$browserAfter;
    '새WER프로세스'=$newWer.Count; '시나리오종료코드'=$scenarioExit; '사용자브라우저변경'=$false }
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Out 'process-report.json') -Encoding UTF8
  $report | ConvertTo-Json
  if ($browserAfter -ne 0 -or $newWer.Count -ne 0) { throw '브라우저 잔류 또는 새 WER 프로세스 확인 필요' }
  exit $scenarioExit
} finally { [void][NoBinaryBrowserErrorMode]::SetErrorMode($previousMode) }
