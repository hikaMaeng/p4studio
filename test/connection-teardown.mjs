// Run with: node --import tsx test/connection-teardown.mjs --agent-binary=<test-owned p4-agent.exe>
// Isolated transport fixture: no model, production database, deployment or remote process.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { StudioDatabase } from "../apps/studio/src/server/database/client.ts";
import { attachBrowserP4Bridge } from "../apps/studio/src/server/agent-socket/browser-bridge.ts";

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const binary = argument("agent-binary"); if (!binary) throw Error("--agent-binary is required");
const port = Number(argument("agent-port") ?? 52010);
assert(Number.isInteger(port) && port >= 52000 && port <= 52010);
const output = resolve(argument("output") ?? "test/20261005/connection-teardown"); mkdirSync(output, { recursive: true });
const report = { status: "failed", binary, binarySha256: createHash("sha256").update(readFileSync(binary)).digest("hex"), url: null, inspections: 20, errors: [], census: [] };
const env = { ...process.env }; for (const key of Object.keys(env)) if (key.startsWith("P4_")) delete env[key];
const agent = spawn(binary, [`127.0.0.1:${port}`, `tcp://127.0.0.1:${port}`], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; agent.stdout.on("data", value => { logs += value; }); agent.stderr.on("data", value => { logs += value; });
const database = new StudioDatabase(":memory:");
const registration = database.createAgent({ name: "isolated teardown probe", host: "127.0.0.1", port });
let browser, server, detach;
const census = () => JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", `$c=@(Get-NetTCPConnection -OwningProcess ${agent.pid} -ErrorAction SilentlyContinue);@{closewait=@($c|Where-Object State -eq CloseWait).Count;established=@($c|Where-Object State -eq Established).Count;listeners=@($c|Where-Object State -eq Listen).Count}|ConvertTo-Json -Compress`], { encoding: "utf8", windowsHide: true }).trim());
try {
  for (let i = 0; i < 100 && !logs.includes("P4_EVENT_AGENT_READY"); i++) {
    if (agent.exitCode !== null) throw Error(logs);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(logs.includes("P4_EVENT_AGENT_READY"), "isolated agent must bind before browser starts");
  const client = await build({ stdin: { contents: `
    import {BrowserP4Connection} from './apps/studio/src/front/p4/connection.ts';
    import {P4_AGENT_INSPECT_CONTENT_TYPE,P4_AGENT_SNAPSHOT_CONTENT_TYPE} from '@p4studio/p4-protocol';
    const status=document.querySelector('[role=status]');
    document.querySelector('button').onclick=async()=>{
      try { let acks=0;
        for(let i=0;i<20;i++){
          const connection=await BrowserP4Connection.open(${JSON.stringify(registration.id)},'tcp://127.0.0.1:${port}');
          const reply=await connection.exchange({kind:'agent',address:'tcp://127.0.0.1:${port}'},null,P4_AGENT_INSPECT_CONTENT_TYPE,{},[P4_AGENT_SNAPSHOT_CONTENT_TYPE],10000);
          if(JSON.parse(new TextDecoder().decode(reply.payload)).nodes.length!==0)throw Error('unexpected model nodes');
          if(await connection.close())acks++; else throw Error('FINISH ACK was not confirmed');
          status.textContent='Completed '+(i+1)+' inspections; ACKs '+acks;
        }
      } catch(error){ status.textContent='Failed: '+error; throw error; }
    };`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "browser", format: "iife", write: false });
  server = createServer((request, response) => {
    if (request.url === "/client.js") { response.setHeader("Content-Type", "text/javascript"); response.end(client.outputFiles[0].text); }
    else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><title>P4 transport fixture</title><button>Inspect 20 connections</button><p role="status">Ready</p><script src="/client.js"></script>'); }
  });
  detach = attachBrowserP4Bridge(server, database);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  report.url = `http://127.0.0.1:${server.address().port}`;
  assert((await fetch(report.url)).ok);
  const require = createRequire(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT ? resolve(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
  const { chromium } = require("playwright");
  browser = await chromium.launch({ headless: true, ...(process.env.HEADLESS_BROWSER_EXECUTABLE ? { executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage(); page.on("pageerror", error => report.errors.push(error.message));
  report.census.push({ phase: "before", ...census() });
  await page.goto(report.url); await page.getByRole("button", { name: "Inspect 20 connections" }).click();
  await page.getByRole("status").filter({ hasText: "Completed 20 inspections; ACKs 20" }).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: resolve(output, "completed.png") });
  report.census.push({ phase: "after", ...census() });
  assert.equal(report.census.at(-1).closewait, 0); assert.equal(report.census.at(-1).established, 0);
  assert.equal(report.errors.length, 0);
  report.status = "passed";
} catch (error) { report.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await browser?.close(); await detach?.();
  if (server) await new Promise(resolve => server.close(resolve));
  database.close();
  const exited = agent.exitCode === null ? new Promise(resolve => agent.once("exit", resolve)) : Promise.resolve();
  agent.kill(); await exited;
  report.cleanup = census(); assert.equal(report.cleanup.listeners, 0);
  writeFileSync(resolve(output, "agent.log"), logs); writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
