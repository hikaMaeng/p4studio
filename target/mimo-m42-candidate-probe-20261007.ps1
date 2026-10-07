$ErrorActionPreference='Stop'
$candidate=Get-Content -LiteralPath test/20261007/mimo-load-fix/placement-candidate.json -Raw|ConvertFrom-Json
$stage=$candidate.stages[2]
$plan64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($stage.planText+' --inspect-memory-plan'))
$script=@'
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$bytes=[Convert]::FromBase64String('__PLAN__')
$info=New-Object System.Diagnostics.ProcessStartInfo
$info.FileName='D:\p4-runs\m42-gemma12b-20261003\bin\p4_staged_server.exe'
$info.WorkingDirectory='D:\p4-runs\m42-gemma12b-20261003\bin'
$info.Arguments='--port 24891';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.EnvironmentVariables['CUDA_VISIBLE_DEVICES']='GPU-9983bf45-0d89-5b0f-0ec6-3525016f28fe'
$info.EnvironmentVariables['CUDA_DEVICE_ORDER']='PCI_BUS_ID'
$proc=New-Object System.Diagnostics.Process;$proc.StartInfo=$info;[void]$proc.Start()
$out=$proc.StandardOutput.ReadToEndAsync();$err=$proc.StandardError.ReadToEndAsync()
$prefix=[BitConverter]::GetBytes([uint32]$bytes.Length);$proc.StandardInput.BaseStream.Write($prefix,0,4);$proc.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$proc.StandardInput.Close()
if(-not $proc.WaitForExit(60000)){$proc.Kill();throw 'Metadata-only helper timeout'}
[Console]::WriteLine($out.Result+$err.Result);[Console]::WriteLine('exit='+$proc.ExitCode)
'@
$script=$script.Replace('__PLAN__',$plan64)
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
$output=ssh -o BatchMode=yes -o ConnectTimeout=8 42mob@192.168.0.29 powershell.exe -NoProfile -NonInteractive -EncodedCommand $encoded
$output|Set-Content -LiteralPath test/20261007/mimo-load-fix/m42-candidate-memory-probe.log -Encoding UTF8
$output|Where-Object {$_ -match 'MEMORY_PLAN|failed|error|exit='}
