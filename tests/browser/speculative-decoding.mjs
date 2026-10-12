import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { browserTestRuntime } from "./runtime.mjs";
import { decodeP4Event, encodeP4Event, frameP4Event, P4FrameReader } from "../../packages/p4-protocol/dist/index.js";

const { url, out, chromium, expect } = browserTestRuntime("speculative-decoding");
await fs.mkdir(out, { recursive: true });
assert.equal((await fetch(`${url}/health`)).status, 200);
const agentId = "fe6ba06a-535f-42cb-b4ae-6e4743fdd903", address = "tcp://127.0.0.1:52000";
const stage = { agentId, nodeGeneration: 9, artifact: "fixture.gguf", layerStart: 0, layerEnd: 1, binary: "fixture", endpoint: "127.0.0.1:52100", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 8, max_output_tokens_per_request: 100, max_output_tokens: 800 } }) };
const model = { id: "speculative-fixture", name: "스페큘러티브 화면 시험 · 모사 P4", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 3000, error: "", createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z", resolvedAddresses: { [agentId]: address }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail", layerStart: 1, layerEnd: 2 }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", updatedAt: "2026-10-11T00:00:00Z", telemetry: null })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
const browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1920, height: 1000 }, locale: "ko-KR" });
await context.addInitScript(() => { if (!localStorage.getItem("p4studio.language")) localStorage.setItem("p4studio.language", "ko"); });
await context.route(`${url}/api/**`, async route => {
  const pathname = new URL(route.request().url()).pathname;
  if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
  let body = {};
  if (pathname === "/api/model-deployments") body = { deployments: [model] };
  else if (pathname === "/api/graph-agents") body = { agents: [{ id: agentId, name: "Fixture", host: "127.0.0.1", port: 52000 }], groups: [] };
  else if (pathname.startsWith("/api/operation-leases")) body = { operationId: route.request().postDataJSON()?.operationId ?? pathname.split("/")[3], expiresAt: Date.now() + 30000, ready: true };
  else if (pathname.endsWith("/receipt")) body = { ...model, ...route.request().postDataJSON() };
  else if (pathname === "/api/agent-groups") body = { groups: [] };
  else if (pathname === "/api/node-labels") body = { labels: [] };
  await route.fulfill({ json: body });
});
const timers = [], sent = [], requests = [];
const bytes = body => new TextEncoder().encode(JSON.stringify(body));
await context.routeWebSocket("**/api/p4-tunnel", socket => {
  const reader = new P4FrameReader();
  const send = (original, contentType, body, eventClass = 2) => socket.send(Buffer.from(frameP4Event(encodeP4Event({ ...original, eventId: randomUUID(), causationId: original.eventId, source: original.target, target: original.source, contentType, class: eventClass, payload: bytes(body) }))));
  socket.onMessage(message => {
    if (typeof message === "string") {
      const control = JSON.parse(message); if (control.type === "open") socket.send(JSON.stringify({ type: "opened", connectionId: control.connectionId, agentId })); return;
    }
    for (const frame of reader.push(new Uint8Array(message), true)) {
      if (!frame.length) { socket.send(Buffer.from([0, 0, 0, 0])); continue; }
      const event = decodeP4Event(frame); sent.push(event.contentType);
      if (!event.payload.length) continue; // This fixture provides round events, not INSPECT/GPU measurements.
      const body = JSON.parse(new TextDecoder().decode(event.payload));
      if (event.contentType.includes("session-v4")) send(event, "application/vnd.p4.llamacpp.session-ready-v4+json", { state: "ready", ...body });
      if (event.contentType.includes("prefill-v3")) {
        assert.equal(body.speculative_observations, true, "The OUTER must opt in to speculative telemetry");
        const sequence = requests.length; requests.push(body.request_id);
        const identity = { load_generation: 42, session_id: body.session_id, request_id: body.request_id, sequence_id: sequence, incarnation: 3 };
        const reply = { ingress_agent: event.source.address, channel: event.source.channel, connection_generation: event.source.generation, correlation_id: event.correlationId, deadline_unix_ms: event.deadline };
        const round = { ...identity, reply, observation_id: `round-${sequence}-1`, position: 12, drafted: 3, accepted: sequence === 0 ? 2 : 0, path: "direct", emitted_tokens: 1 };
        timers.push(setTimeout(() => { send(event, "application/vnd.p4.llamacpp.speculative-round-v1+json", round, 3); send(event, "application/vnd.p4.llamacpp.speculative-round-v1+json", round, 3); }, 300));
        timers.push(setTimeout(() => send(event, "application/vnd.p4.llamacpp.speculative-round-v1+json", { ...round, observation_id: `round-${sequence}-2`, position: 16, accepted: sequence === 0 ? 2 : 3, path: sequence === 0 ? "direct" : "full" }, 3), 2500));
        timers.push(setTimeout(() => {
          send(event, "application/vnd.p4.llamacpp.output-v6+json", { ...identity, submission_event_id: event.eventId, token: 1, text: "모사 P4 정상 응답", position: 16, stop: "length", output_ordinal: 0, release_operation_id: 10 });
          send(event, "application/vnd.p4.llamacpp.release-receipt-v1+json", { load_generation: 42, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: event.eventId, sequence_id: sequence, incarnation: 3, operation_id: 10 }] }, 3);
        }, 5000));
      }
    }
  });
});
const page = await context.newPage(), errors = [], checks = [], screenshots = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const section = () => page.getByTestId("inference-speculative").first();
const capture = async name => { await section().scrollIntoViewIfNeeded(); const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); screenshots.push(file); };
let status = "passed", failure;
try {
  await page.goto(`${url}/inference/query`);
  await page.getByRole("textbox", { name: /프롬프트/ }).fill("스페큘러티브 채택률 화면 시험");
  await page.getByLabel("동시 질의 수", { exact: true }).fill("2");
  await page.getByLabel("반복 횟수", { exact: true }).fill("1");
  await page.getByRole("button", { name: "질의 전송", exact: true }).click();
  await expect(section().getByTestId("inference-speculative-rate")).toHaveText("33.3%");
  await expect(section().getByRole("img")).toBeVisible(); await capture("live"); checks.push("Live weighted acceptance from framed mock P4, duplicates ignored");
  await expect(section().getByTestId("inference-speculative-rate")).toHaveText("58.3%");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("p4studio.inference.history.v1")).runs[0].state)).toBe("completed");
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem("p4studio.inference.history.v1")).runs[0]);
  assert.equal(run.speculative.rounds, 4); assert.equal(run.speculative.accepted, 7); assert.equal(run.speculative.drafted, 12);
  await page.goto(`${url}/inference/history/${run.id}`); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("58.3%");
  await page.reload(); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("58.3%");
  const retainedCard = await page.getByText("노드 retained 항목", { exact: true }).locator("..").boundingBox();
  const speculativeCard = await section().boundingBox();
  assert(retainedCard && speculativeCard);
  assert(speculativeCard.x > retainedCard.x && Math.abs(speculativeCard.y - retainedCard.y) < 2);
  assert(Math.abs(speculativeCard.width - retainedCard.width) < 2);
  checks.push("Acceptance card occupies the final monitoring row beside retained items");
  await expect(section().getByTestId("inference-speculative-annotation")).toContainText("라운드당 추천 3");
  assert.equal(await section().getByRole("img").count(), 1); await capture("history"); checks.push("History reload, one acceptance chart, draft annotation");
  await page.goto(`${url}/inference/history/${run.id}/requests/${requests[0]}`); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("66.7%");
  await page.reload(); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("66.7%"); await capture("request");
  assert(await section().evaluate(element => {
    const table = document.querySelector('[aria-label="요청별 스테이지 증거"]');
    return table && Boolean(element.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_PRECEDING);
  }));
  checks.push("Request acceptance card follows stage evidence");
  await page.goBack(); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("58.3%");
  await page.goForward(); await expect(section().getByTestId("inference-speculative-rate")).toHaveText("66.7%"); checks.push("Per-request deep URL, reload, back/forward");
  for (const width of [768, 390]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await capture(`request-${width}`); }
  await page.evaluate(() => localStorage.setItem("p4studio.language", "ar")); await page.reload(); await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(section().getByTestId("inference-speculative-rate")).toHaveText("66.7%"); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await capture("rtl"); checks.push("Responsive and Arabic RTL");
  await page.evaluate(() => localStorage.setItem("p4studio.language", "ko"));
  await page.goto(`${url}/inference/query`);
  await page.getByRole("textbox", { name: /프롬프트/ }).fill("미수집 확인");
  // A new run displays an explicit uncollected state before its first round arrives.
  await page.getByRole("button", { name: "질의 전송", exact: true }).click();
  await expect(section()).toContainText("미수집"); checks.push("No telemetry is distinct from zero percent");
  assert.deepEqual(errors, []);
} catch (error) { status = "failed"; failure = String(error.stack ?? error); process.exitCode = 1; await page.screenshot({ path: path.join(out, "failure.png") }); }
finally { timers.forEach(clearTimeout); await browser.close(); const report = { status, evidence: "Mock P4 framed browser contract; no GPU inference", checks, screenshots, errors, sent, failure }; await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
