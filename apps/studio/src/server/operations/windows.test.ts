import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { windowsScript, type ManagementProfile } from "./windows.js";
import type { HostProof } from "../../common/recovery.js";
const profile: ManagementProfile = { agentId: "00000000-0000-4000-8000-000000000001", host: "tuf", port: 52000, sshHost: "tuf", sshPort: 22, sshUser: "admin", root: "C:\\approved-agent-fixture", task: "P4", agentHash: "a".repeat(64), nativeHash: "b".repeat(64), launchHash: "c".repeat(64), identityName: "management_identity" };
const before: HostProof = { observedAt: "2026-10-06T00:00:00Z", agentPid: 11, agentBorn: "2026-10-06T00:00:00.0000000Z", agentHash: profile.agentHash, nativeHash: profile.nativeHash, launchHash: profile.launchHash, processes: [{ pid: 11, parentPid: 1, born: "2026-10-06T00:00:00.0000000Z", path: `${profile.root}\\p4-agent.exe`, command: "agent 0.0.0.0:52000 tcp://tuf:52000" }, { pid: 12, parentPid: 11, born: "2026-10-06T00:00:00.0000000Z", path: `${profile.root}\\p4_staged_server.exe`, command: "native" }], ports: [52000, 24110], gpu: [], freeRamKiB: 1000 };
function run(mode: string) {
  // Real generated PowerShell with deterministic OS cmdlets and an actual temporary exclusive file lock.
  const lockPath = join(tmpdir(), `p4studio-recovery-fixture-${crypto.randomUUID()}.lock`);
  const setup = `$mode='${mode}'
$global:fixtureProcesses=@([pscustomobject]@{ProcessId=11;ParentProcessId=1;ExecutablePath='C:\\approved-agent-fixture\\p4-agent.exe';CommandLine='agent 0.0.0.0:52000 tcp://tuf:52000';CreationDate=[DateTime]::Parse('2026-10-06T00:00:00Z')},[pscustomobject]@{ProcessId=12;ParentProcessId=11;ExecutablePath='C:\\approved-agent-fixture\\p4_staged_server.exe';CommandLine='native';CreationDate=[DateTime]::Parse('2026-10-06T00:00:00Z')})
function Get-FileHash($LiteralPath,$Algorithm) {if($mode -eq 'hash') {return @{Hash='wrong'}};if($LiteralPath -like '*p4-agent.exe'){return @{Hash=('a'*64)}};if($LiteralPath -like '*p4_staged_server.exe'){return @{Hash=('b'*64)}};return @{Hash=('c'*64)}}
function Get-ScheduledTask($TaskName) {return @{Actions=@(@{Execute='cmd.exe';Arguments='/c C:\\approved-agent-fixture\\run-agent.cmd'});Principal=@{LogonType='S4U'}}}
function Get-CimInstance($ClassName,$Filter) {if($ClassName -eq 'Win32_OperatingSystem'){return @{FreePhysicalMemory=1000}};if($Filter){$id=[int]($Filter.Split('=')[1]);if($mode -eq 'reuse' -and $id -eq 12){return [pscustomobject]@{ProcessId=12;ExecutablePath='C:\\approved-agent-fixture\\p4_staged_server.exe';CreationDate=[DateTime]::Parse('2026-10-06T00:01:00Z')}};return @($global:fixtureProcesses | Where-Object {$_.ProcessId -eq $id})};return $global:fixtureProcesses}
function Get-NetTCPConnection($State) {return @($global:fixtureProcesses | ForEach-Object {[pscustomobject]@{OwningProcess=$_.ProcessId;LocalPort=$(if($_.ProcessId -eq 12){24110}else{52000})}})}
function Stop-Process($Id,[switch]$Force,$ErrorAction) { [Console]::Out.WriteLine('STOP:'+ $Id);$global:fixtureProcesses=@($global:fixtureProcesses | Where-Object {$_.ProcessId -ne $Id}) }
function Stop-ScheduledTask($TaskName) {}
function Start-ScheduledTask($TaskName) { $global:fixtureProcesses=@([pscustomobject]@{ProcessId=21;ParentProcessId=1;ExecutablePath='C:\\approved-agent-fixture\\p4-agent.exe';CommandLine='agent 0.0.0.0:52000 tcp://tuf:52000';CreationDate=[DateTime]::Parse('2026-10-06T00:02:00Z')}) }
function New-Item($ItemType,$Path,$ErrorAction) {}
function Set-Content($LiteralPath,$Value) {}
function Test-Path($LiteralPath) {return $false}
function nvidia-smi {return @('gpu, 0 MiB')}
function Start-Sleep($Milliseconds) {}
if($mode -eq 'orphan'){$global:fixtureProcesses=@($global:fixtureProcesses | Where-Object {$_.ProcessId -eq 12})}
`;
  const bootstrap = Buffer.from("[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & ([ScriptBlock]::Create([Console]::In.ReadToEnd()))", "utf16le").toString("base64");
  const script = windowsScript(profile, "00000000-0000-4000-8000-000000000002", mode === "birth" ? { ...before, agentBorn: "old-birth" } : mode === "orphan" ? { ...before, agentPid: 0, agentBorn: "", processes: before.processes.slice(1), ports: [24110] } : before).replace("(Join-Path $p.root 'studio-recovery.lock')", `'${lockPath.replaceAll("'", "''")}'`);
  const occupied = mode === "lock" ? `$fixtureLock=[IO.File]::Open('${lockPath.replaceAll("'", "''")}',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)\n` : "";
  try { return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", bootstrap], { input: setup + occupied + script, encoding: "utf8", timeout: 10_000, windowsHide: true }); }
  finally { try { unlinkSync(lockPath); } catch { /* A pre-inspection rejection need not create a lock. */ } }
}
it.runIf(process.platform === "win32")("reclaims the approved tree, verifies absence and starts a distinct agent", () => {
  const result = run("valid"); expect(result.status, result.stdout + result.stderr).toBe(0); expect(result.stdout).toContain("STOP:12"); expect(result.stdout).toContain("STOP:11"); expect(result.stdout).toContain('"agentPid":21');
});
it.runIf(process.platform === "win32")("reclaims approved orphan native resources and starts an absent agent", () => {
  const result = run("orphan"); expect(result.status, result.stdout + result.stderr).toBe(0); expect(result.stdout).toContain("STOP:12"); expect(result.stdout).not.toContain("STOP:11"); expect(result.stdout).toContain('"agentPid":21');
});
it.runIf(process.platform === "win32").each(["birth", "hash", "reuse", "lock"])("rejects %s identity changes before stopping an unrelated process", mode => {
  const result = run(mode); expect(result.status, result.stdout + result.stderr).toBe(1); expect(result.stdout).not.toContain("STOP:"); expect(result.stdout).toContain('"type":"failure"');
});
