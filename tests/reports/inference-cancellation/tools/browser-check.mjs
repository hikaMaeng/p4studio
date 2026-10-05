import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { decodeP4Event, encodeP4Event, frameP4Event, P4FrameReader, decodeLifecycleMetadata, encodeLifecycleMetadata, NODE_UNLOAD_CONTENT_TYPE, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, P4_AGENT_INSPECT_CONTENT_TYPE, P4_AGENT_SNAPSHOT_CONTENT_TYPE, decodeAgentInspectionResponse } from "../../../../packages/p4-protocol/dist/index.js";

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const url = arg("--url"), out = arg("--out");
if (!url || !out) throw new Error("Pass --url and --out");
const { chromium } = createRequire(path.join(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, "package.json"))("playwright");
const { expect } = createRequire(path.join(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, "package.json"))("playwright/test");
await fs.mkdir(out, { recursive: true });
assert.equal((await fetch(`${url}/health`)).status, 200);
const browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE });
const agentId = "fe6ba06a-535f-42cb-b4ae-6e4743fdd901", modelId = "model-cancel-fixture";
const baseAddress = "127.0.0.1:52000";
const text = value => new TextEncoder().encode(JSON.stringify(value));
const fixture = () => {
  const stage = { agentId, nodeGeneration: 9, artifact: "fixture.gguf", layerStart: 0, layerEnd: 1, binary: "fixture", endpoint: "127.0.0.1:52100", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_requests: 8, max_output_tokens_per_request: 100, max_output_tokens: 800 } }) };
  return { id: modelId, name: "취소 시험 모델 · 모사 P4", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 3000, error: "", createdAt: "2026-10-05T09:00:00Z", updatedAt: "2026-10-05T09:00:00Z", sessionProof: null, resolvedAddresses: { [agentId]: baseAddress }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail", layerStart: 1, layerEnd: 2 }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", loadRequested: true, detail: "", updatedAt: "2026-10-05T09:00:00Z", telemetry: { load_generation: 42 } })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
};
const snapshot = nodes => ({ schema: 1, protocol_version: 3, generated_at_unix_ms: Date.now(), machine: { capability: { os: "fixture", arch: "x86_64", cpu: { physical_cores: 1, logical_cores: 2 }, memory: { total_bytes: 1024 }, gpus: [], adapters: ["llamacpp"] }, occupancy: { memory: { available_bytes: 512, used_bytes: 512 }, gpus: [] }, probes: { memory: { source: "fixture", state: "available", detail: null }, gpus: { source: "fixture", state: "available", detail: null } } }, nodes: nodes.map(node_id => ({ node_id, generation: 9, load_generation: 42, adapter_kind: "llamacpp", lifecycle_state: "loaded", lifecycle_result: null, state: "loaded", delivery: { stopped: false, input_retained: 0, completion_retained: 0 } })), broker: { sampled_at_unix_ms: Date.now(), state: "ok" }, transport: undefined });
const response = (original, contentType, body, eventClass = 2, source = original.target, adapterKind = "llamacpp") => ({ ...original, eventId: randomUUID(), causationId: original.eventId, source, target: original.source, class: eventClass, contentType, adapterKind, payload: body instanceof Uint8Array ? body : text(body) });
const results = [], screenshots = [];
let status = "passed", failure;
async function scenario(name, mode, work) {
  const context = await browser.newContext({ viewport: { width: 1535, height: 1000 }, locale: "ko-KR" });
  await context.addInitScript(() => localStorage.setItem("p4studio.language", "ko"));
  const page = await context.newPage(), errors = [], sent = [], requests = new Map(), nodes = new Set(["head", "tail"]);
  let record = fixture();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await context.route(`${url}/api/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body = {};
    if (pathname === "/api/model-deployments") body = { deployments: [record] };
    else if (pathname.endsWith("/receipt") || pathname.endsWith("/reconcile")) { record = { ...record, ...route.request().postDataJSON() }; body = record; }
    else if (pathname === "/api/graph-agents") body = { agents: [{ id: agentId, name: "모사 에이전트", host: "127.0.0.1", port: 52000 }], groups: [] };
    else if (pathname === "/api/node-labels") body = { labels: [] };
    else if (pathname === "/api/agent-groups") body = { groups: [] };
    else if (pathname === "/api/snapshot") {
      const outer = { kind: "outer", address: baseAddress, channel: "fixture", generation: 1 };
      const event = { eventId: "fixture-snapshot", correlationId: "fixture", causationId: null, source: { kind: "agent", address: baseAddress }, target: outer, returnRoute: outer, class: 0, sequence: 1, deadline: null, adapterKind: null, contentType: P4_AGENT_SNAPSHOT_CONTENT_TYPE, payload: text(snapshot([...nodes])) };
      const decoded = decodeAgentInspectionResponse(encodeP4Event(event), "fixture");
      body = { agents: [{ id: agentId, name: "모사 에이전트", host: "127.0.0.1", port: 52000, reachability: "reachable", latencyMs: 1, lastProbeAt: new Date().toISOString(), probeError: null, createdAt: record.createdAt, updatedAt: record.updatedAt, inspection: { state: "available", inspectedAt: new Date().toISOString(), error: null, snapshot: decoded } }], nodes: [], models: [], pipelines: [], protocol: { frameVersion: 1, eventVersion: 3, statusSchemaVersion: 1 }, generatedAt: new Date().toISOString() };
    }
    await route.fulfill({ json: body });
  });
  await context.routeWebSocket("**/api/p4-tunnel", socket => {
    const reader = new P4FrameReader();
    const send = event => socket.send(Buffer.from(frameP4Event(encodeP4Event(event))));
    socket.onMessage(message => {
      if (typeof message === "string") {
        const control = JSON.parse(message);
        if (control.type === "open") socket.send(JSON.stringify({ type: "opened", connectionId: control.connectionId, agentId }));
        return;
      }
      for (const frame of reader.push(new Uint8Array(message), true)) {
        if (!frame.length) { socket.send(Buffer.from([0, 0, 0, 0])); continue; }
        const event = decodeP4Event(frame); sent.push({ contentType: event.contentType, class: event.class, at: Date.now(), eventId: event.eventId });
        if (event.contentType === P4_AGENT_INSPECT_CONTENT_TYPE) { send(response(event, P4_AGENT_SNAPSHOT_CONTENT_TYPE, snapshot([...nodes]), 0, event.target, null)); continue; }
        if (event.contentType.includes("session-v4")) {
          const body = JSON.parse(new TextDecoder().decode(event.payload));
          const reply = () => send(response(event, "application/vnd.p4.llamacpp.session-ready-v4+json", { state: "ready", load_generation: body.load_generation, session_id: body.session_id }));
          if (mode === "preparing") setTimeout(reply, 1000); else reply();
        } else if (event.contentType.includes("prefill-v3")) {
          const body = JSON.parse(new TextDecoder().decode(event.payload)); const sequence = requests.size;
          requests.set(body.request_id, { event, body, sequence });
          send(response(event, "application/vnd.p4.llamacpp.output-v6+json", { load_generation: 42, session_id: body.session_id, request_id: body.request_id, submission_event_id: event.eventId, incarnation: 3, sequence_id: sequence, token: 1, text: "모사 응답 ", position: 0, stop: mode === "interval" ? "length" : null, output_ordinal: 0, release_operation_id: mode === "interval" ? 10 : null }));
          if (mode === "interval") send(response(event, "application/vnd.p4.llamacpp.release-receipt-v1+json", { load_generation: 42, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: event.eventId, sequence_id: sequence, incarnation: 3, operation_id: 10 }] }, 3));
        } else if (event.contentType.includes("cancel-v1")) {
          assert.equal(event.class, 0); const command = JSON.parse(new TextDecoder().decode(event.payload)); const original = requests.get(command.request_id);
          assert(original); assert.equal(command.submission_event_id, original.event.eventId); assert.deepEqual(event.source, original.event.source);
          send(response(original.event, "application/vnd.p4.llamacpp.error-v2+json", { code: "LLAMA_REQUEST_CANCELLED", detail: "request cancelled while admitted;native_kv_stop_proven=false", owner: { load_generation: 42, session_id: command.session_id, request_id: command.request_id, incarnation: 3 } }));
          setTimeout(() => send(response(original.event, "application/vnd.p4.llamacpp.output-v6+json", { load_generation: 42, session_id: command.session_id, request_id: command.request_id, submission_event_id: original.event.eventId, incarnation: 3, sequence_id: original.sequence, token: 2, text: "보존된 토큰", position: 1, stop: null, output_ordinal: 1, release_operation_id: null })), 200);
          setTimeout(() => send(response(original.event, "application/vnd.p4.llamacpp.release-receipt-v1+json", { load_generation: 42, session_id: command.session_id, members: [{ request_id: command.request_id, submission_event_id: original.event.eventId, sequence_id: original.sequence, incarnation: 3, operation_id: 10 }] }, 3)), 650);
        } else if (event.contentType === NODE_UNLOAD_CONTENT_TYPE) {
          const metadata = decodeLifecycleMetadata(event.payload).metadata;
          assert.equal(sent.filter(value => value.contentType.includes("cancel-v1")).length, 2);
          assert(Date.now() - sent.find(value => value.contentType.includes("cancel-v1")).at >= 600, "UNLOAD must wait for cancellation receipts");
          nodes.delete(metadata.node_id);
          const body = encodeLifecycleMetadata({ schema: 1, operation: "unload", node_id: metadata.node_id, node_generation: 9, adapter_kind: "llamacpp", status: "succeeded", resource_state: "absent", adapter_content_type: "application/vnd.p4.llamacpp.unloaded-v3+json", first_error: null, cleanup_error: null }, text({ load_generation: 42 }));
          send(response(event, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, body, 0, event.target, null));
        }
      }
    });
  });
  const capture = async suffix => { const file = path.join(out, `${name}-${suffix}.png`); await page.screenshot({ path: file, fullPage: false }); screenshots.push(file); };
  const count = family => sent.filter(event => event.contentType.includes(family)).length;
  const run = async () => page.evaluate(() => JSON.parse(localStorage.getItem("p4studio.inference.history.v1")).runs[0]);
  try {
    await page.goto(`${url}/inference/query`);
    await page.getByRole("textbox", { name: /프롬프트/ }).fill("취소 시험 질의");
    await page.getByLabel("동시 질의 수", { exact: true }).fill("2");
    await page.getByLabel("반복 횟수", { exact: true }).fill("3");
    await page.getByLabel("반복 간격 (초)", { exact: true }).fill(mode === "interval" ? "60" : "0");
    await page.getByRole("button", { name: "질의 전송", exact: true }).click();
    await expect(page.getByTestId("inference-run-stop")).toBeVisible();
    await work({ page, capture, count, run });
    assert.deepEqual(errors, []);
    results.push({ name, status: "passed", sent });
  } catch (error) { await capture("failure"); await fs.writeFile(path.join(out, `${name}-failure.txt`), JSON.stringify({ errors, text: await page.locator("body").innerText() }, null, 2)); throw error; }
  finally { await context.close(); }
}
try {
  await scenario("streaming-stop", "streaming", async ({ page, capture, count, run }) => {
    await expect.poll(() => count("prefill-v3")).toBe(2);
    await expect(page.getByTestId("inference-run-group").getByText("실행 중", { exact: true })).toBeVisible();
    await expect(page.getByTestId("inference-run-delete")).toBeDisabled(); await capture("running");
    await page.getByTestId("inference-run-stop").click();
    await expect(page.getByTestId("inference-run-stop")).toBeDisabled(); await capture("cancelling");
    await expect(page.getByTestId("inference-run-group").getByText("취소됨", { exact: true })).toBeVisible();
    assert.equal(count("prefill-v3"), 2); assert.equal(count("cancel-v1"), 2);
    const saved = await run(); assert.equal(saved.state, "cancelled"); assert(saved.requests.every(request => request.state === "cancelled" && request.text === "모사 응답 보존된 토큰"));
    await capture("cancelled");
    await page.getByRole("button", { name: "기록", exact: true }).click();
    await expect(page.getByTestId("inference-history-delete")).toBeEnabled();
    await page.getByTestId("inference-history-delete").click(); await expect(page.getByTestId("inference-history-row")).toHaveCount(0);
  });
  await scenario("interval-stop", "interval", async ({ page, count, run }) => {
    await expect.poll(() => count("prefill-v3")).toBe(2);
    await expect(page.getByTestId("inference-run-summary")).toContainText("2 / 2");
    const started = Date.now(); await page.getByTestId("inference-run-stop").click();
    await expect(page.getByTestId("inference-run-group").getByText("취소됨", { exact: true })).toBeVisible();
    assert(Date.now() - started < 3000); assert.equal(count("prefill-v3"), 2); assert.equal(count("cancel-v1"), 0); assert((await run()).requests.every(request => request.state === "completed"));
  });
  await scenario("preparing-stop", "preparing", async ({ page, count, run }) => {
    await page.getByTestId("inference-run-stop").click(); await expect(page.getByTestId("inference-run-group").getByText("취소됨", { exact: true })).toBeVisible();
    assert.equal(count("prefill-v3"), 0); assert.equal((await run()).state, "cancelled");
  });
  await scenario("model-unload", "streaming", async ({ page, count, run, capture }) => {
    await expect.poll(() => count("prefill-v3")).toBe(2); await page.getByRole("button", { name: "모델", exact: true }).click();
    await page.getByTestId("model-row").getByRole("button", { name: "모델 언로딩", exact: true }).click();
    await expect(page.getByTestId("model-row-status")).toContainText("언로딩 완료");
    assert.equal(count("cancel-v1"), 2); assert.equal(count("prefill-v3"), 2); assert.equal(count("node.unload"), 2); assert.equal((await run()).state, "cancelled"); await capture("unloaded");
  });
  await scenario("node-unload", "streaming", async ({ page, count, run, capture }) => {
    await expect.poll(() => count("prefill-v3")).toBe(2); await page.getByRole("button", { name: "에이전트", exact: true }).click();
    await page.getByTestId("agent-row").press("Enter");
    await page.getByRole("tab", { name: /^노드/ }).click();
    await page.getByRole("button", { name: "모델 언로드", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "모델 언로드", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(count("cancel-v1"), 2); assert.equal(count("prefill-v3"), 2); assert.equal(count("node.unload"), 1); assert.equal((await run()).state, "cancelled"); await capture("unloaded");
  });
} catch (error) { status = "failed"; failure = error.stack; }
await fs.writeFile(path.join(out, "browser-report.json"), JSON.stringify({ status, url, evidence: "scenario-based; P4 binary WebSocket responses mocked; no native GPU execution", results, screenshots, failure }, null, 2));
await browser.close();
console.log(JSON.stringify({ status, scenarios: results.length, report: path.join(out, "browser-report.json"), failure }));
if (status !== "passed") process.exitCode = 1;
