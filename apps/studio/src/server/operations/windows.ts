import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { hostProofSchema, type HostProof } from "../../common/recovery.js";

export const managementProfileSchema = z.object({
  agentId: z.string().uuid(), host: z.string().regex(/^[\w.-]+$/), port: z.number().int().min(1).max(65535),
  sshHost: z.string().regex(/^[\w.-]+$/), sshPort: z.number().int().min(1).max(65535).default(22), sshUser: z.string().regex(/^[\w.-]+$/),
  root: z.string().regex(/^[A-Za-z]:\\[^\r\n'"`$]+$/), task: z.string().regex(/^[\w.-]+$/),
  agentHash: z.string().regex(/^[A-Fa-f0-9]{64}$/), nativeHash: z.string().regex(/^[A-Fa-f0-9]{64}$/), launchHash: z.string().regex(/^[A-Fa-f0-9]{64}$/),
  identityName: z.string().regex(/^[\w.-]+$/).default("management_identity"),
}).strict();
export type ManagementProfile = z.infer<typeof managementProfileSchema>;
const quote = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;

/** A dedicated, hash-pinned Windows installation. No shell command or PID comes from HTTP input. */
export function windowsScript(profile: ManagementProfile, operationId: string, before?: HostProof, startOnly = false) {
  return `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$p=ConvertFrom-Json ${quote(profile)}
$original=ConvertFrom-Json ${quote(before ?? null)}
$operation=${quote(operationId)} | ConvertFrom-Json
$resume=${startOnly ? "$true" : "$false"}
$phase='inspect'; $stopped=$false; $after=$null; $evidence=$null; $managementLock=$null
function Open-RecoveryLock { [IO.File]::Open((Join-Path $p.root 'studio-recovery.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
function Emit($value) { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 12)) }
function Hash($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
function Identity($proc) { [ordered]@{pid=[int]$proc.ProcessId;parentPid=[int]$proc.ParentProcessId;born=$proc.CreationDate.ToUniversalTime().ToString('o');path=$proc.ExecutablePath;command=$proc.CommandLine} }
function VerifyInstallation {
 if((Hash ($p.root+'\\p4-agent.exe')) -ne $p.agentHash -or (Hash ($p.root+'\\p4_staged_server.exe')) -ne $p.nativeHash -or (Hash ($p.root+'\\run-agent.cmd')) -ne $p.launchHash){throw 'Approved binary or launch script hash changed'}
 $task=Get-ScheduledTask -TaskName $p.task
 if(@($task.Actions).Count -ne 1 -or $task.Actions.Execute -ne 'cmd.exe' -or $task.Actions.Arguments -ne ('/c '+$p.root+'\\run-agent.cmd') -or $task.Principal.LogonType.ToString() -ne 'S4U'){throw 'Approved startup contract changed'}
}
function Snapshot {
 VerifyInstallation
 $all=@(Get-CimInstance Win32_Process)
 $owned=@($all | Where-Object {$_.ExecutablePath -in @(($p.root+'\\p4-agent.exe'),($p.root+'\\p4_staged_server.exe'))})
 $agents=@($owned | Where-Object {$_.ExecutablePath -eq ($p.root+'\\p4-agent.exe')})
 if($agents.Count -gt 1){throw 'More than one agent in the dedicated installation'}
 $agent=$agents[0]
 if($agent -and $agent.CommandLine -notlike ('*0.0.0.0:'+ $p.port +' tcp://'+$p.host+':'+$p.port+'*')){throw 'Agent endpoint changed'}
 $listeners=@(Get-NetTCPConnection -State Listen)
 $entry=@($listeners | Where-Object {$_.LocalPort -eq $p.port})
 if(($agent -and -not $entry.Count) -or @($entry | Where-Object {$_.OwningProcess -ne $agent.ProcessId}).Count){throw 'Agent listener owner changed'}
 $tree=@();if($agent){$tree=@([int]$agent.ProcessId)}
 do { $more=@($all | Where-Object {$_.ParentProcessId -in $tree -and $_.ProcessId -notin $tree}); $tree+=@($more | ForEach-Object {[int]$_.ProcessId}) } while($more.Count)
 if(@($all | Where-Object {$_.ProcessId -in $tree -and $_.ExecutablePath -notin @(($p.root+'\\p4-agent.exe'),($p.root+'\\p4_staged_server.exe'))}).Count){throw 'Unapproved process in the agent tree'}
 [ordered]@{observedAt=[DateTime]::UtcNow.ToString('o');agentPid=[int]$agent.ProcessId;agentBorn=$(if($agent){$agent.CreationDate.ToUniversalTime().ToString('o')}else{''});agentHash=$p.agentHash;nativeHash=$p.nativeHash;launchHash=$p.launchHash;processes=@($owned | ForEach-Object {Identity $_});ports=@($listeners | Where-Object {$_.OwningProcess -in @($owned.ProcessId)} | Select-Object -ExpandProperty LocalPort -Unique);gpu=@(nvidia-smi --query-gpu=name,memory.used,memory.free --format=csv 2>$null);freeRamKiB=[double](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory}
}
try {
 if($original){$managementLock=Open-RecoveryLock}
 if(-not $resume){$current=Snapshot}else{VerifyInstallation}
 if(-not $original){Emit @{type='proof';proof=$current};exit 0}
 if(-not $resume){
 if($current.agentPid -ne $original.agentPid -or $current.agentBorn -ne $original.agentBorn -or @($current.processes).Count -ne @($original.processes).Count){throw 'Process identity changed after the recovery plan'}
 foreach($proc in $current.processes){$old=@($original.processes | Where-Object {$_.pid -eq $proc.pid});if($old.Count -ne 1 -or $old[0].born -ne $proc.born -or $old[0].path -ne $proc.path -or $old[0].command -ne $proc.command){throw 'Process identity changed after the recovery plan'}}
 if((@($current.ports | Sort-Object) -join ',') -ne (@($original.ports | Sort-Object) -join ',')){throw 'Owned listener set changed'}
 $evidence=Join-Path $p.root ('recovery-'+$operation)
 New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
 $current | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidence 'before.json')
 if(Test-Path -LiteralPath ($p.root+'\\agent.log')){Copy-Item -LiteralPath ($p.root+'\\agent.log') -Destination (Join-Path $evidence 'agent-before.log')}
 $phase='stopping'; Emit @{type='progress';phase=$phase;stopped=$false}
 # Every stop is bound to PID + birth + executable again immediately before mutation.
 foreach($old in @($original.processes | Sort-Object @{Expression={$_.pid -eq $original.agentPid}})) {
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+$old.pid)
  if($live){if($live.ExecutablePath -ne $old.path -or $live.CreationDate.ToUniversalTime().ToString('o') -ne $old.born){throw 'PID reused before process stop'};Stop-Process -Id $old.pid -Force -ErrorAction Stop}
 }
 Stop-ScheduledTask -TaskName $p.task
 }
 if($resume){$evidence=Join-Path $p.root ('recovery-'+$operation);if(-not (Test-Path -LiteralPath $evidence)){New-Item -ItemType Directory -Path $evidence | Out-Null}}
 Start-Sleep -Milliseconds 750
 if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -in @(($p.root+'\\p4-agent.exe'),($p.root+'\\p4_staged_server.exe'))}).Count){throw 'Owned processes remain; no restart performed'}
 if(@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in $original.ports}).Count){throw 'Captured listeners remain; no restart performed'}
 $stopped=$true; $phase='starting'; Emit @{type='progress';phase=$phase;stopped=$true}
 VerifyInstallation; Start-ScheduledTask -TaskName $p.task
 $deadline=[DateTime]::UtcNow.AddSeconds(25)
 do {Start-Sleep -Milliseconds 500;try {$after=Snapshot;if($after.agentPid -eq 0){$after=$null}} catch {$after=$null}} while(-not $after -and [DateTime]::UtcNow -lt $deadline)
 if(-not $after -or ($after.agentPid -eq $original.agentPid -and $after.agentBorn -eq $original.agentBorn)){throw 'Fresh agent startup not confirmed'}
 if(@($after.processes).Count -ne 1 -or @($after.ports | Where-Object {$_ -ne $p.port}).Count){throw 'Native process or owned native listener remains after startup'}
 $after.evidence=$evidence
 $after | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $evidence 'after.json')
 Emit @{type='proof';proof=$after;stopped=$true};exit 0
} catch {Emit @{type='failure';phase=$phase;stopped=$stopped;error=$_.Exception.Message;evidence=$evidence};exit 1}
finally {if($managementLock){$managementLock.Dispose()}}
`;
}

export class WindowsHostManager {
  async inspect(profile: ManagementProfile) { return this.run(profile, crypto.randomUUID()); }
  async recover(profile: ManagementProfile, id: string, before: HostProof, progress: (phase: string, stopped: boolean) => void) { return this.run(profile, id, before, progress); }
  async resume(profile: ManagementProfile, id: string, before: HostProof, progress: (phase: string, stopped: boolean) => void) { return this.run(profile, id, before, progress, true); }
  private async run(profile: ManagementProfile, id: string, before?: HostProof, progress?: (phase: string, stopped: boolean) => void, startOnly = false): Promise<HostProof> {
    const directory = mkdtempSync(join(tmpdir(), "p4studio-management-")), identity = join(directory, "identity");
    try {
      copyFileSync(`/run/studio-ssh/${profile.identityName}`, identity); chmodSync(identity, 0o600);
      const script = windowsScript(profile, id, before, startOnly);
      const encoded = Buffer.from("[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & ([ScriptBlock]::Create([Console]::In.ReadToEnd()))", "utf16le").toString("base64");
      return await new Promise<HostProof>((resolve, reject) => {
        const child = spawn("ssh", ["-T", "-i", identity, "-p", String(profile.sshPort), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=/run/studio-ssh/known_hosts", "-o", "ConnectTimeout=10", `${profile.sshUser}@${profile.sshHost}`, "powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        child.stdin.on("error", () => {}); child.stdin.end(script);
        let buffer = "", bytes = 0, proof: HostProof | undefined, error = "SSH ended without a host proof";
        const timer = setTimeout(() => { error = "Host-management deadline exceeded; remote outcome is unknown"; child.kill(); }, 90_000);
        child.stdout.on("data", (chunk: Buffer) => {
          bytes += chunk.length; if (bytes > 4 * 1024 * 1024) { error = "Host-management output exceeded limit"; child.kill(); return; }
          buffer += chunk.toString("utf8"); const lines = buffer.split(/\r?\n/); buffer = lines.pop()!;
          for (const line of lines) {
            try { const value = JSON.parse(line); if (value.type === "proof") proof = hostProofSchema.parse(value.proof);
              else if (value.type === "progress") progress?.(String(value.phase), value.stopped === true);
              else if (value.type === "failure") { error = String(value.error); progress?.(String(value.phase), value.stopped === true); }
            } catch { /* PowerShell may emit diagnostic lines; only structured proofs count. */ }
          }
        });
        child.stderr.on("data", (chunk: Buffer) => { if (!String(chunk).startsWith("#< CLIXML")) error = String(chunk).slice(0, 1500); });
        child.once("error", reject);
        child.once("close", code => { clearTimeout(timer); if (code === 0 && proof) resolve(proof); else reject(new Error(error)); });
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
}
