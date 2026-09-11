import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioEnv } from "../env/schema.js";
import { setAgentRoutes } from "./routes.js";

/** Private network egress, owned by the Studio runtime and restarted after SSH loss. */
export function startAgentTunnels(config: StudioEnv["P4STUDIO_AGENT_TUNNELS"]) {
  setAgentRoutes(config);
  if (!config.length) return () => {};
  const directory = mkdtempSync(join(tmpdir(), "p4studio-ssh-")), identity = join(directory, "identity");
  copyFileSync("/run/studio-ssh/id_ed25519", identity); chmodSync(identity, 0o600);
  let stopped = false; const children = new Set<ChildProcess>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const start = (entry: typeof config[number]) => {
    if (stopped) return;
    const child = spawn("ssh", ["-N", "-T", "-i", identity, "-p", String(entry.sshPort),
      "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
      "-o", "UserKnownHostsFile=/run/studio-ssh/known_hosts", "-o", "ExitOnForwardFailure=yes",
      "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
      "-L", `127.0.0.1:${entry.localPort}:${entry.agentHost}:${entry.agentPort}`, `${entry.sshUser}@${entry.sshHost}`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    children.add(child);
    child.stderr?.on("data", bytes => console.error(`agent-tunnel ${entry.agentHost}:${entry.agentPort}: ${String(bytes).trim()}`));
    child.on("error", error => console.error(`agent-tunnel failed: ${error.message}`));
    child.once("close", () => { children.delete(child); if (!stopped) { const timer = setTimeout(() => { timers.delete(timer); start(entry); }, 5000); timers.add(timer); } });
  };
  for (const entry of config) start(entry);
  return () => { stopped = true; for (const timer of timers) clearTimeout(timer); for (const child of children) child.kill(); setAgentRoutes([]); rmSync(directory, { recursive: true, force: true }); };
}
