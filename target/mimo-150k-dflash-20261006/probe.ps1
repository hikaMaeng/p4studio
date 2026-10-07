param([string]$PlanPath, [switch]$Inspect)
$plan = Get-Content -LiteralPath $PlanPath -Raw
if ($Inspect) { $plan += ' --inspect-memory-plan' }
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = 'F:\dev\p4\.cache\staged-local-gemma12b-ninja-20261002\p4_staged_server.exe'
$info.Arguments = '--port 24891'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.EnvironmentVariables['CUDA_VISIBLE_DEVICES'] = 'GPU-38e6dbac-fee5-ac16-62d4-cfacbe02f8ed'
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $info
[void]$proc.Start()
$stdoutTask = $proc.StandardOutput.ReadToEndAsync()
$stderrTask = $proc.StandardError.ReadToEndAsync()
$bytes = [Text.Encoding]::UTF8.GetBytes($plan)
$prefix = [BitConverter]::GetBytes([uint32]$bytes.Length)
$proc.StandardInput.BaseStream.Write($prefix, 0, 4)
$proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$proc.StandardInput.Close()
if (-not $proc.WaitForExit(45000)) { $proc.Kill(); throw 'Native plan probe timed out' }
$output = $stdoutTask.Result + $stderrTask.Result + "`nexit=$($proc.ExitCode)"
$output | Set-Content -LiteralPath ($PlanPath + '.log') -Encoding UTF8
$output -split "`n" | Where-Object { $_ -match 'MEMORY_PLAN|CAPABILITY|PLAN_APPLIED|failed|error|exit=' }
