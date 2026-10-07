$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$p=ConvertFrom-Json '{"agentId":"35d728b2-4ead-4f81-949f-7721e3e1b364","host":"192.168.0.17","port":52000,"sshHost":"192.168.0.17","sshPort":22,"sshUser":"admin","root":"C:\\p4-agent-current","task":"P4-Agent-Current-4b62e3e4","agentHash":"260FD187B976D348AED7D84501B456BD1BA28651534302ADDA34E6632545A971","nativeHash":"2AB3F9EF3D78C6FDEC3AC779AB2567777D0A3F15E3530BD5386E749A5CF7ED92","launchHash":"727B508CD013B0FB348F2B4FA5468720A72C638C0D6CD529A01694C0F965D6A3","identityName":"management_identity"}'
$original=ConvertFrom-Json 'null'
$operation='"c0a36ab7-0477-4a6f-b7c9-4e9e26da2c51"' | ConvertFrom-Json
$phase='inspect'; $stopped=$false; $after=$null; $evidence=$null
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 12)) }
function Hash($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
function Identity($proc) { [ordered]@{pid=[int]$proc.ProcessId;parentPid=[int]$proc.ParentProcessId;born=$proc.CreationDate.ToUniversalTime().ToString('o');path=$proc.ExecutablePath;command=$proc.CommandLine} }
function VerifyInstallation {
 if((Hash ($p.root+'\p4-agent.exe')) -ne $p.agentHash -or (Hash ($p.root+'\p4_staged_server.exe')) -ne $p.nativeHash -or (Hash ($p.root+'\run-agent.cmd')) -ne $p.launchHash){throw 'Approved binary or launch script hash changed'}
 $task=Get-ScheduledTask -TaskName $p.task
 if(@($task.Actions).Count -ne 1 -or $task.Actions.Execute -ne 'cmd.exe' -or $task.Actions.Arguments -ne ('/c '+$p.root+'\run-agent.cmd') -or $task.Principal.LogonType.ToString() -ne 'S4U'){throw 'Approved startup contract changed'}
}
function Snapshot {
 VerifyInstallation
 $all=@(Get-CimInstance Win32_Process)
 $owned=@($all | Where-Object {$_.ExecutablePath -in @($p.root+'\p4-agent.exe',$p.root+'\p4_staged_server.exe')})
 Emit @{root=$p.root;owned=$owned;all=@($all | Where-Object {$_.Name -eq "p4-agent.exe"} | Select-Object ProcessId,ExecutablePath)}; $agents=@($owned | Where-Object {$_.ExecutablePath -eq ($p.root+'\p4-agent.exe')})
 if($agents.Count -ne 1){throw 'Expected exactly one agent in the dedicated installation'}
 $agent=$agents[0]
 if($agent.CommandLine -notlike ('*0.0.0.0:'+ $p.port +' tcp://'+$p.host+':'+$p.port+'*')){throw 'Agent endpoint changed'}
 $listeners=@(Get-NetTCPConnection -State Listen)
 $entry=@($listeners | Where-Object {$_.LocalPort -eq $p.port})
 if(-not $entry.Count -or @($entry | Where-Object {$_.OwningProcess -ne $agent.ProcessId}).Count){throw 'Agent listener owner changed'}
 $tree=@([int]$agent.ProcessId)
 do { $more=@($all | Where-Object {$_.ParentProcessId -in $tree -and $_.ProcessId -notin $tree}); $tree+=@($more | ForEach-Object {[int]$_.ProcessId}) } while($more.Count)
 if(@($all | Where-Object {$_.ProcessId -in $tree -and $_.ExecutablePath -notin @($p.root+'\p4-agent.exe',$p.root+'\p4_staged_server.exe')}).Count){throw 'Unapproved process in the agent tree'}
 [ordered]@{observedAt=[DateTime]::UtcNow.ToString('o');agentPid=[int]$agent.ProcessId;agentBorn=$agent.CreationDate.ToUniversalTime().ToString('o');agentHash=$p.agentHash;nativeHash=$p.nativeHash;launchHash=$p.launchHash;processes=@($owned | ForEach-Object {Identity $_});ports=@($listeners | Where-Object {$_.OwningProcess -in @($owned.ProcessId)} | Select-Object -ExpandProperty LocalPort -Unique);gpu=@(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv 2>$null);freeRamKiB=[double](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory}
}
try {
 $current=Snapshot
 if(-not $original){Emit @{type='proof';proof=$current};exit 0}
 if($current.agentPid -ne $original.agentPid -or $current.agentBorn -ne $original.agentBorn -or @($current.processes).Count -ne @($original.processes).Count){throw 'Process identity changed after the recovery plan'}
 foreach($proc in $current.processes){$old=@($original.processes | Where-Object {$_.pid -eq $proc.pid});if($old.Count -ne 1 -or $old[0].born -ne $proc.born -or $old[0].path -ne $proc.path -or $old[0].command -ne $proc.command){throw 'Process identity changed after the recovery plan'}}
 if((@($current.ports | Sort-Object) -join ',') -ne (@($original.ports | Sort-Object) -join ',')){throw 'Owned listener set changed'}
 $evidence=Join-Path $p.root ('recovery-'+$operation)
 New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
 $current | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidence 'before.json')
 if(Test-Path -LiteralPath ($p.root+'\agent.log')){Copy-Item -LiteralPath ($p.root+'\agent.log') -Destination (Join-Path $evidence 'agent-before.log')}
 $phase='stopping'; Emit @{type='progress';phase=$phase;stopped=$false}
 # Every stop is bound to PID + birth + executable again immediately before mutation.
 foreach($old in @($original.processes | Sort-Object @{Expression={$_.pid -eq $original.agentPid}})) {
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+$old.pid)
  if($live){if($live.ExecutablePath -ne $old.path -or $live.CreationDate.ToUniversalTime().ToString('o') -ne $old.born){throw 'PID reused before process stop'};Stop-Process -Id $old.pid -Force -ErrorAction Stop}
 }
 Stop-ScheduledTask -TaskName $p.task
 Start-Sleep -Milliseconds 750
 if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -in @($p.root+'\p4-agent.exe',$p.root+'\p4_staged_server.exe')}).Count){throw 'Owned processes remain; no restart performed'}
 if(@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in $original.ports}).Count){throw 'Captured listeners remain; no restart performed'}
 $stopped=$true; $phase='starting'; Emit @{type='progress';phase=$phase;stopped=$true}
 VerifyInstallation; Start-ScheduledTask -TaskName $p.task
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 do {Start-Sleep -Milliseconds 500;try {$after=Snapshot} catch {$after=$null}} while(-not $after -and [DateTime]::UtcNow -lt $deadline)
 if(-not $after -or ($after.agentPid -eq $original.agentPid -and $after.agentBorn -eq $original.agentBorn)){throw 'Fresh agent startup not confirmed'}
 if(@($after.processes).Count -ne 1 -or @($after.ports | Where-Object {$_ -ne $p.port}).Count){throw 'Native process or owned native listener remains after startup'}
 $after.evidence=$evidence
 $after | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidence 'after.json')
 Emit @{type='proof';proof=$after;stopped=$true};exit 0
} catch {Emit @{type='failure';phase=$phase;stopped=$stopped;error=$_.Exception.Message;evidence=$evidence};exit 1}
