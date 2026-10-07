$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='C:\p4-agent-current'
$taskName='P4-Agent-Current-4b62e3e4'
$expectedAgent=8596
$expectedChildren=@(14792,15528)
$agent=Get-CimInstance Win32_Process -Filter "ProcessId=$expectedAgent"
if(-not $agent -or $agent.ExecutablePath -ne "$root\p4-agent.exe" -or $agent.CommandLine -notmatch '0.0.0.0:52000 tcp://192.168.0.17:52000'){throw 'Agent identity changed'}
$listener=@(Get-NetTCPConnection -State Listen -LocalPort 52000)
if($listener.Count -ne 1 -or $listener[0].OwningProcess -ne $expectedAgent){throw 'Listener identity changed'}
$children=@(Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $expectedAgent})
if($children.Count -ne 2){throw 'Child count changed'}
foreach($child in $children){if($child.ProcessId -notin $expectedChildren -or $child.ExecutablePath -ne "$root\p4_staged_server.exe"){throw 'Child identity changed'}}
$task=Get-ScheduledTask -TaskName $taskName
if($task.Actions.Execute -ne 'cmd.exe' -or $task.Actions.Arguments -ne '/c C:\p4-agent-current\run-agent.cmd' -or $task.Principal.LogonType.ToString() -ne 'S4U'){throw 'Startup contract changed'}
$sha=(Get-FileHash -LiteralPath "$root\p4-agent.exe").Hash
$nativeSha=(Get-FileHash -LiteralPath "$root\p4_staged_server.exe").Hash
$evidence=Join-Path $root ('reset-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $evidence | Out-Null
Copy-Item -LiteralPath "$root\agent.log" -Destination (Join-Path $evidence 'agent-before.log')
$beforeGpu=@(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv)
$beforeRam=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
@($agent)+$children | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $evidence 'before-processes.json')
taskkill /PID $expectedAgent /T /F
if($LASTEXITCODE -ne 0){throw 'Agent tree termination failed'}
Stop-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
foreach($childId in $expectedChildren){
 $remaining=Get-CimInstance Win32_Process -Filter "ProcessId=$childId"
 if($remaining){
  $original=$children | Where-Object {$_.ProcessId -eq $childId}
  if($remaining.ExecutablePath -ne $original.ExecutablePath -or $remaining.CreationDate -ne $original.CreationDate){throw 'Child PID reused'}
  Stop-Process -Id $childId -Force
 }
}
$remainingP4=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -in @("$root\p4-agent.exe","$root\p4_staged_server.exe")})
if($remainingP4.Count){throw 'P4 processes remain after reset'}
if(Get-NetTCPConnection -State Listen -LocalPort 52000,24110,24111 -ErrorAction SilentlyContinue){throw 'Owned listener remains after reset'}
Start-ScheduledTask -TaskName $taskName
$deadline=(Get-Date).AddSeconds(20)
$newAgent=$null
while((Get-Date) -lt $deadline){
 Start-Sleep -Seconds 1
 $newListener=Get-NetTCPConnection -State Listen -LocalPort 52000 -ErrorAction SilentlyContinue
 if($newListener){$newAgent=Get-CimInstance Win32_Process -Filter "ProcessId=$($newListener.OwningProcess)";break}
}
if(-not $newAgent -or $newAgent.ProcessId -eq $expectedAgent -or $newAgent.ExecutablePath -ne "$root\p4-agent.exe"){throw 'Fresh agent not confirmed'}
if((Get-FileHash -LiteralPath "$root\p4-agent.exe").Hash -ne $sha -or (Get-FileHash -LiteralPath "$root\p4_staged_server.exe").Hash -ne $nativeSha){throw 'Binary changed during reset'}
$native=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq "$root\p4_staged_server.exe"})
if($native.Count){throw 'Native process present after fresh startup'}
$report=[ordered]@{host='tuf';address='tcp://192.168.0.17:52000';oldAgentPid=$expectedAgent;terminatedNativePids=$expectedChildren;newAgentPid=$newAgent.ProcessId;agentSha256=$sha;nativeSha256=$nativeSha;nativeProcesses=$native.Count;nativeListeners=@(Get-NetTCPConnection -State Listen -LocalPort 24110,24111 -ErrorAction SilentlyContinue).Count;gpuBefore=$beforeGpu;gpuAfter=@(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv);freeRamKiBBefore=$beforeRam;freeRamKiBAfter=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory;taskState=(Get-ScheduledTask -TaskName $taskName).State.ToString();evidence=$evidence}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidence 'reset-report.json')
$report | ConvertTo-Json -Depth 4
Get-Content -LiteralPath "$root\agent.log" -Tail 6
