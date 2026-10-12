import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { P4Endpoint, P4Event } from "@p4studio/p4-protocol";
import { P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE, P4_SCOPE_CLOSED_CONTENT_TYPE, SESSION_CONTRACT_ERRORS, type InferenceRunInput, type P4BatchObservation } from "@p4studio/studio_domain/common";
vi.mock("../../p4/lease.js", () => ({ acquireOperationLease: async () => ({ release: async () => {}, checkpoint: async () => {} }) }));

const wire = vi.hoisted(() => ({ contracts: [] as (string | undefined)[], sessions: [] as { type: string; body: unknown; target: P4Endpoint }[], events: [] as P4Event[], retained: [] as P4Endpoint[], sentTimes: [] as number[], listeners: new Set<(event: P4Event, at: number) => void>(), holdSession: false, resume: undefined as (() => void) | undefined, closed: false }));
vi.mock("../../p4/reception.js", () => ({
  readAgentTopology: async () => ({ agents: [{ id: "agent", name: "Agent", host: "head", port: 52000 }], groups: [] }),
  BrowserP4Reception: class {
    operationId = "operation";
    async retainDispatchConnection(target: P4Endpoint) { wire.retained.push(target); }
    dispatchIdentity() { return { outer: { kind: "outer" as const, address: "head:52000", channel: "outer", generation: 1 }, nextSequence: wire.events.length + 1 }; }
    async exchange(target: P4Endpoint, _adapter: string, _type: string, body: { session_id: string; load_generation: number }) {
      wire.sessions.push({ type: _type, body, target });
      if (wire.holdSession) await new Promise<void>(resolve => { wire.resume = resolve; });
      return { source: target, contentType: "application/vnd.p4.llamacpp.session-ready-v4+json", payload: new TextEncoder().encode(JSON.stringify({ state: "ready", ...body })) };
    }
    dispatch(target: P4Endpoint, adapterKind: string, contentType: string, body: unknown, eventClass: number) {
      const source: P4Endpoint = { kind: "outer", address: "head:52000", channel: "outer", generation: 1 };
      const event: P4Event = { eventId: crypto.randomUUID(), correlationId: this.operationId, causationId: null, source, target, returnRoute: source, class: eventClass, sequence: wire.events.length + 1, deadline: null, adapterKind, contentType, payload: new TextEncoder().encode(JSON.stringify(body)) };
      wire.events.push(event); wire.sentTimes.push(performance.now()); return { event, sentAt: new Date().toISOString(), sentAtMs: performance.now() };
    }
    owns() { return true; }
    onEvent(listener: (event: P4Event, at: number) => void) { wire.listeners.add(listener); return () => { wire.listeners.delete(listener); }; }
    async close() { wire.closed = true; return true; }
  },
}));
vi.mock("../../p4/inspection.js", () => ({ inspectGraphAgent: async () => { throw new Error("Fixture has no monitoring"); } }));
vi.mock("../models/api.js", () => ({ recordSessionProof: async () => {} }));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }); wire.contracts = []; wire.sessions = []; wire.events = []; wire.retained = []; wire.sentTimes = []; wire.listeners.clear(); wire.holdSession = false; wire.resume = undefined; wire.closed = false;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() }, addEventListener: vi.fn(), setTimeout, clearTimeout });
  const stage = { agentId: "agent", nodeGeneration: 9, artifact: "model.gguf", layerStart: 0, layerEnd: 1, binary: "binary", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 100, max_output_tokens_per_request: 100, max_output_tokens: 10000 } }) };
  const model = { id: "model", name: "Model", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 100, error: "", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", resolvedAddresses: { agent: "head:52000" }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail" }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", updatedAt: "", telemetry: wire.contracts.length ? { load_generation: 42, ...(wire.contracts[stageId === "head" ? 0 : 1] !== undefined ? { speculative_contract: wire.contracts[stageId === "head" ? 0 : 1] } : {}) } : null })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ deployments: [{ ...model, reports: model.reports.map((report, index) => ({ ...report, telemetry: wire.contracts.length ? { load_generation: 42, ...(wire.contracts[index] !== undefined ? { speculative_contract: wire.contracts[index] } : {}) } : null })) }] }), { status: 200 }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start(settings: Pick<InferenceRunInput, "concurrency" | "repetitions" | "intervalMs" | "repeatMode"> = { concurrency: 2, repetitions: 3, intervalMs: 60_000 }) {
  const { startInference } = await import("./api.js"), { inference } = await import("@p4studio/studio_domain/front");
  startInference(); await inference.create({ modelId: "model", prompt: "prompt", ...settings, maxTokens: 100 });
  await vi.advanceTimersByTimeAsync(0);
  return { inference, id: inference.runIds.value[0]! };
}
const payload = (event: P4Event) => JSON.parse(new TextDecoder().decode(event.payload));
const emit = (original: P4Event, contentType: string, body: unknown) => {
  const reply = { ...original, eventId: crypto.randomUUID(), source: original.target, target: original.source, class: contentType === P4_RELEASE_RECEIPT_CONTENT_TYPE ? 3 : 2, causationId: original.eventId, contentType, payload: new TextEncoder().encode(JSON.stringify(body)) };
  wire.listeners.forEach(listener => listener(reply, performance.now()));
};
const prefills = () => wire.events.filter(event => event.contentType.includes("prefill-v3"));
const speculativeType = "application/vnd.p4.llamacpp.speculative-round-v1+json";
function speculative(original: P4Event, changes = {}) {
  const body = payload(original), source = original.source as Extract<P4Endpoint, { kind: "outer" }>;
  return { observation_id: "round-one", load_generation: 42, session_id: body.session_id, request_id: body.request_id,
    reply: { ingress_agent: source.address, channel: source.channel, connection_generation: source.generation, correlation_id: original.correlationId, deadline_unix_ms: original.deadline },
    sequence_id: 0, incarnation: 3, position: 12, drafted: 3, accepted: 2, path: "direct", emitted_tokens: 1, ...changes };
}
function emitSpeculative(original: P4Event, body: unknown, source = original.target, eventClass = 3) {
  const reply = { ...original, eventId: crypto.randomUUID(), source, target: original.source, class: eventClass, contentType: speculativeType, payload: new TextEncoder().encode(JSON.stringify(body)) };
  wire.listeners.forEach(listener => listener(reply, performance.now()));
}
it("consumes owner-bound head speculative telemetry once and persists run/request metrics", async () => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 1, intervalMs: 0 });
  const original = prefills()[0]!, body = speculative(original);
  expect(payload(original).speculative_observations).toBe(true);
  emitSpeculative(original, body); emitSpeculative(original, body);
  await vi.advanceTimersByTimeAsync(3000);
  const run = inference.runModel(id).value!;
  expect(run.speculative).toMatchObject({ rounds: 1, drafted: 3, accepted: 2, emittedTokens: 1 });
  expect(run.requests[0]!.speculative).toEqual(run.speculative);
  const saved = vi.mocked(window.localStorage.setItem).mock.calls.filter(([key]) => key === "p4studio.inference.history.v1").at(-1)!;
  expect(JSON.parse(saved[1]).runs[0].speculative.accepted).toBe(2);
});
it.each(["load", "session", "request", "owner", "tail", "class"])("rejects speculative %s identity mismatches before collecting metrics", async mismatch => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 1, intervalMs: 0 });
  const original = prefills()[0]!, body = speculative(original);
  if (mismatch === "load") body.load_generation = 41;
  if (mismatch === "session") body.session_id = "old-run";
  if (mismatch === "request") body.request_id = "other-request";
  if (mismatch === "owner") body.reply.channel = "other-owner";
  emitSpeculative(original, body, mismatch === "tail" ? { ...original.target, kind: "node", nodeId: "tail", generation: 9 } : original.target, mismatch === "class" ? 2 : 3);
  await vi.advanceTimersByTimeAsync(250);
  expect(inference.runModel(id).value!.speculative).toBeUndefined();
  expect(inference.runModel(id).value!.error).toMatch(/speculative/);
});
it("binds speculative incarnation to the subsequent OUTPUT owner", async () => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 1, intervalMs: 0 });
  const original = prefills()[0]!;
  emitSpeculative(original, speculative(original, { incarnation: 4 }));
  streamedOutput(original, 0, 0, false);
  await vi.advanceTimersByTimeAsync(250);
  expect(inference.runModel(id).value!.error).toMatch(/incarnation/);
  expect(inference.runModel(id).value!.requests[0]!.receivedTokens).toBe(0);
});
const scopeCloses = () => wire.events.filter(event => event.contentType.includes("scope-close-v1"));
const closeScope = () => {
  const event = scopeCloses().at(-1)!;
  const reply: P4Event = { ...event, eventId: crypto.randomUUID(), source: event.target, target: event.source, returnRoute: event.source as Extract<P4Endpoint, { kind: "outer" }>, class: 0, causationId: event.eventId, contentType: P4_SCOPE_CLOSED_CONTENT_TYPE,
    payload: new TextEncoder().encode(JSON.stringify({ load_generation: 42, status: "closed", native_kv_stop_proven: true })) };
  wire.listeners.forEach(listener => listener(reply, performance.now()));
};
function settle(original: P4Event, sequence: number) {
  const body = payload(original);
  emit(original, P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_REQUEST_CANCELLED", detail: "native_kv_stop_proven=false", owner: { load_generation: 42, session_id: body.session_id, request_id: body.request_id, incarnation: 3 } });
  emit(original, P4_RELEASE_RECEIPT_CONTENT_TYPE, { load_generation: 42, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, operation_id: 10 }] });
}
function complete(original: P4Event, sequence: number) {
  const body = payload(original);
  emit(original, "application/vnd.p4.llamacpp.output-v6+json", { load_generation: 42, session_id: body.session_id, request_id: body.request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, token: 1, text: "partial answer", position: 0, stop: "length", output_ordinal: 0, release_operation_id: 10 });
  emit(original, P4_RELEASE_RECEIPT_CONTENT_TYPE, { load_generation: 42, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, operation_id: 10 }] });
}
function streamedOutput(original: P4Event, sequence: number, ordinal: number, terminal: boolean) {
  const body = payload(original);
  emit(original, "application/vnd.p4.llamacpp.output-v6+json", { load_generation: 42, session_id: body.session_id, request_id: body.request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, token: ordinal + 1, text: "answer", position: ordinal, stop: terminal ? "length" : null, output_ordinal: ordinal, release_operation_id: terminal ? 10 : null });
  if (terminal) emit(original, P4_RELEASE_RECEIPT_CONTENT_TYPE, { load_generation: 42, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, operation_id: 10 }] });
}
it("measures TTFT and 160-second responses from each of ten overlapping five-second waves", async () => {
  const { inference, id } = await start({ concurrency: 10, repetitions: 10, intervalMs: 5000 });
  const { groupInferenceWaves } = await import("@p4studio/studio_domain/front");
  const firstSentAt = wire.sentTimes[0]!;
  for (let wave = 0; wave < 10; wave += 1) {
    const originals = prefills().slice(wave * 10, (wave + 1) * 10);
    expect(originals).toHaveLength(10);
    originals.forEach((original, lane) => {
      const sequence = wave * 10 + lane;
      setTimeout(() => streamedOutput(original, sequence, 0, false), 500);
      setTimeout(() => streamedOutput(original, sequence, 1, true), 160_000);
    });
    await vi.advanceTimersByTimeAsync(5000);
  }
  let run = inference.runModel(id).value!;
  expect(run.requests.map(request => request.ttftMs)).toEqual(Array(100).fill(500));
  expect(groupInferenceWaves(run).map(wave => wave.elapsedMs)).toEqual(Array(10).fill(null));
  await vi.advanceTimersByTimeAsync(firstSentAt + 160_250 - performance.now());
  run = inference.runModel(id).value!;
  expect(groupInferenceWaves(run).map(wave => wave.elapsedMs)).toEqual([160_000, ...Array(9).fill(null)]);
  await vi.advanceTimersByTimeAsync(45_000);
  run = inference.runModel(id).value!;
  expect(run).toMatchObject({ state: "completed", submitted: 100, completed: 100 });
  expect(groupInferenceWaves(run).map(wave => ({ ttft: wave.ttftP50Ms, elapsed: wave.elapsedMs }))).toEqual(Array(10).fill({ ttft: 500, elapsed: 160_000 }));
  expect(run.requests.map(request => Date.parse(request.completedAt!) - Date.parse(request.submittedAt))).toEqual(Array(100).fill(160_000));
  expect(wire.closed).toBe(true);
});
it("includes waiting after a later wave is sent while excluding its five-second dispatch interval", async () => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 2, intervalMs: 5000 });
  const { groupInferenceWaves } = await import("@p4studio/studio_domain/front");
  await vi.advanceTimersByTimeAsync(500); streamedOutput(prefills()[0]!, 0, 0, false);
  await vi.advanceTimersByTimeAsync(4500); expect(prefills()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1500); streamedOutput(prefills()[1]!, 1, 0, false);
  await vi.advanceTimersByTimeAsync(3500); streamedOutput(prefills()[0]!, 0, 1, true);
  await vi.advanceTimersByTimeAsync(5000); streamedOutput(prefills()[1]!, 1, 1, true);
  await vi.advanceTimersByTimeAsync(50);
  const run = inference.runModel(id).value!;
  expect(run.state).toBe("completed");
  expect(groupInferenceWaves(run).map(wave => ({ ttft: wave.ttftP50Ms, elapsed: wave.elapsedMs }))).toEqual([{ ttft: 500, elapsed: 10_000 }, { ttft: 1500, elapsed: 10_000 }]);
});
it("sends ten requests every five seconds for ten waves without waiting for any output", async () => {
  const { inference, id } = await start({ concurrency: 10, repetitions: 10, intervalMs: 5000 });
  const startedAt = wire.sentTimes[0]!;
  expect(prefills()).toHaveLength(10);
  for (let wave = 1; wave < 10; wave += 1) {
    await vi.advanceTimersByTimeAsync(4999); expect(prefills()).toHaveLength(wave * 10);
    await vi.advanceTimersByTimeAsync(1); expect(prefills()).toHaveLength((wave + 1) * 10);
    expect(wire.sentTimes.slice(wave * 10, (wave + 1) * 10)).toEqual(Array(10).fill(startedAt + wave * 5000));
  }
  await vi.advanceTimersByTimeAsync(250);
  expect(inference.runModel(id).value).toMatchObject({ state: "running", submitted: 100, completed: 0 });
  expect(wire.closed).toBe(false);
  const originals = prefills(); originals.slice(0, -1).forEach(complete);
  await vi.advanceTimersByTimeAsync(50); expect(wire.closed).toBe(false);
  complete(originals.at(-1)!, 99); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value).toMatchObject({ state: "completed", completed: 100 });
  expect(wire.closed).toBe(true);
});
it("keeps the next dispatch at five seconds when the preceding wave finishes early", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 2, intervalMs: 5000 });
  await vi.advanceTimersByTimeAsync(1000); prefills().forEach(complete);
  await vi.advanceTimersByTimeAsync(3999); expect(prefills()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1); expect(prefills()).toHaveLength(4);
  expect(inference.runModel(id).value).toMatchObject({ state: "running", completed: 2 });
  prefills().slice(2).forEach((event, index) => complete(event, index + 2));
  await vi.advanceTimersByTimeAsync(50); expect(wire.closed).toBe(true);
});
it("retains the head route and permits a second run after exact OUTPUT and RELEASE settlement", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 1, intervalMs: 1000 });
  expect(wire.retained).toEqual([{ kind: "node", address: "head:52000", nodeId: "head", generation: 9 }]);
  prefills().forEach(complete); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value).toMatchObject({ state: "completed", pendingSettlement: 0 });
  await inference.create({ modelId: "model", prompt: "second", concurrency: 2, repetitions: 1, intervalMs: 1000, maxTokens: 100 });
  await vi.advanceTimersByTimeAsync(0);
  expect(wire.retained).toHaveLength(2);
  expect(prefills()).toHaveLength(4);
  prefills().slice(2).forEach(complete); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runIds.value.map(runId => inference.runModel(runId).value?.state)).toEqual(["completed", "completed"]);
});
it("sends zero-interval waves immediately and retains the connection for their outputs", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 3, intervalMs: 0 });
  expect(prefills()).toHaveLength(6); expect(wire.closed).toBe(false);
  prefills().forEach(complete); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value?.state).toBe("completed"); expect(wire.closed).toBe(true);
});
it("cancels unfinished requests across overlapping waves and suppresses later dispatch", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 3, intervalMs: 5000 });
  await vi.advanceTimersByTimeAsync(5000); const originals = prefills(); expect(originals).toHaveLength(4);
  complete(originals[0]!, 0);
  const pending = inference.cancel(id);
  expect(scopeCloses()).toHaveLength(1);
  originals.slice(1).forEach((event, index) => settle(event, index + 1));
  closeScope();
  await vi.advanceTimersByTimeAsync(250); await pending;
  await vi.advanceTimersByTimeAsync(5000); expect(prefills()).toHaveLength(4); expect(wire.closed).toBe(true);
  expect(inference.runModel(id).value?.requests.map(request => request.state)).toEqual(["completed", "cancelled", "cancelled", "cancelled"]);
});
it("stops an active wave, consumes exact cancellation responses and sends no later PREFILL", async () => {
  const { inference, id } = await start(); const originals = prefills(); expect(originals).toHaveLength(2);
  const pending = inference.cancel(id); expect(scopeCloses()).toHaveLength(1);
  originals.forEach(settle); closeScope(); await vi.advanceTimersByTimeAsync(250); await pending;
  expect(inference.runModel(id).value?.state).toBe("cancelled");
  await vi.advanceTimersByTimeAsync(60_000); expect(prefills()).toHaveLength(2); expect(wire.closed).toBe(true);
});
it("interrupts the interval immediately and preserves the completed wave", async () => {
  const { inference, id } = await start(); prefills().forEach(complete); await vi.advanceTimersByTimeAsync(50);
  const pending = inference.cancel(id); expect(scopeCloses()).toHaveLength(1); closeScope(); await vi.advanceTimersByTimeAsync(250); await pending; await vi.advanceTimersByTimeAsync(60_000);
  expect(prefills()).toHaveLength(2); expect(scopeCloses()).toHaveLength(1);
  expect(inference.runModel(id).value?.requests.map(request => [request.state, request.text])).toEqual([["completed", "partial answer"], ["completed", "partial answer"]]);
});
it("cancels preparation and never submits PREFILL after a late SESSION_READY", async () => {
  wire.holdSession = true; const { inference, id } = await start(); await inference.cancel(id);
  wire.resume?.(); await vi.advanceTimersByTimeAsync(0);
  expect(prefills()).toHaveLength(0); expect(inference.runModel(id).value?.state).toBe("cancelled");
});
it("bounds an unconfirmed stop and preserves partial request results", async () => {
  const { inference, id } = await start(); const originals = prefills(); complete(originals[0]!, 0);
  const pending = inference.cancel(id); await vi.advanceTimersByTimeAsync(250); await pending;
  const run = inference.runModel(id).value!; expect(run.state).toBe("unknown"); expect(run.requests.map(request => request.state)).toEqual(["completed", "unknown"]);
  await vi.advanceTimersByTimeAsync(60_000); expect(prefills()).toHaveLength(2);
});

it("완료 후 간격 방식은 첫 출력이 아니라 앞 웨이브의 모든 terminal까지 기다린다", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 2, intervalMs: 1000, repeatMode: "after-completion" });
  expect(prefills()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(5000); streamedOutput(prefills()[0]!, 0, 0, false);
  await vi.advanceTimersByTimeAsync(5000); expect(prefills()).toHaveLength(2);
  streamedOutput(prefills()[0]!, 0, 1, true); await vi.advanceTimersByTimeAsync(1000); expect(prefills()).toHaveLength(2);
  complete(prefills()[1]!, 1); await vi.advanceTimersByTimeAsync(25);
  await vi.advanceTimersByTimeAsync(999); expect(prefills()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1); expect(prefills()).toHaveLength(4);
  expect(inference.runModel(id).value!.settings?.repeatMode).toBe("after-completion");
  complete(prefills()[2]!, 2); complete(prefills()[3]!, 3); await vi.advanceTimersByTimeAsync(250);
  expect(inference.runModel(id).value!.state).toBe("completed");
});
it("완료 대기 중 중지하면 다음 웨이브를 전송하지 않는다", async () => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 2, intervalMs: 0, repeatMode: "after-completion" });
  const stopping = inference.cancel(id); settle(prefills()[0]!, 0); closeScope();
  await vi.advanceTimersByTimeAsync(100); await stopping; expect(prefills()).toHaveLength(1);
});
it.each([false, true])("v4와 v5 모두 head READY 이후 tail을 순차 설치한다(%s)", async v5 => {
  if (v5) wire.contracts = ["cc/2/5/3", "cc/2/5/3"];
  wire.holdSession = true;
  const { inference } = await import("@p4studio/studio_domain/front"), { startInference } = await import("./api.js");
  startInference(); await inference.create({ modelId: "model", prompt: "prompt", concurrency: 1, repetitions: 1, intervalMs: 0, maxTokens: 100 });
  await vi.advanceTimersByTimeAsync(0); expect(wire.sessions).toHaveLength(1);
  expect(wire.sessions[0]!.target).toMatchObject({ nodeId: "head" });
  expect(wire.sessions[0]!.type).toContain(v5 ? "session-v5" : "session-v4");
  expect(wire.sessions[0]!.body).toMatchObject(v5 ? { stage_contracts: ["cc/2/5/3", "cc/2/5/3"] } : { stage_index: 0 });
  expect(wire.sessions[0]!.body).not.toHaveProperty("speculative_contract");
  if (!v5) expect(wire.sessions[0]!.body).not.toHaveProperty("stage_contracts");
  wire.resume!(); await vi.advanceTimersByTimeAsync(0); expect(wire.sessions).toHaveLength(2);
  expect(wire.sessions[1]!.target).toMatchObject({ nodeId: "tail" });
  wire.holdSession = false; wire.resume!(); await vi.advanceTimersByTimeAsync(0); complete(prefills()[0]!, 0); await vi.advanceTimersByTimeAsync(250);
});
it.each([
  { contracts: ["cc/2/5/3", "none/0/0/0"], code: SESSION_CONTRACT_ERRORS.mismatch },
  { contracts: ["cc/2/5/3", undefined], code: SESSION_CONTRACT_ERRORS.partial },
])("계약 사전 거부 코드를 화면 모델까지 보존하며 SESSION을 전송하지 않는다: $code", async ({ contracts, code }) => {
  wire.contracts = contracts; const { inference } = await start({ concurrency: 1, repetitions: 1, intervalMs: 0 });
  expect(wire.sessions).toHaveLength(0); expect(prefills()).toHaveLength(0); expect(inference.activity.value.error).toBe(code);
});

it("A2 실제 BatchObservation 수신→중복 제거→run 누적→저장→복원을 연결한다", async () => {
  const { inference, id } = await start({ concurrency: 1, repetitions: 1, intervalMs: 0 });
  const original = prefills()[0]!, request = payload(original), outer = original.source as Extract<P4Endpoint, { kind: "outer" }>;
  const owner = (index: number) => ({ request_id: index === 0 ? request.request_id : `other-${index}`,
    reply: { ingress_agent: outer.address, channel: outer.channel, connection_generation: outer.generation, correlation_id: original.correlationId, deadline_unix_ms: null },
    submission_event_id: index === 0 ? original.eventId : `submission-${index}`, sequence_id: index, incarnation: 3,
    request_issue_index: 1, prefill_rows: 0, decode_rows: 0, verify_rows: 1, replay_rows: 0, rows: [] });
  const observation: P4BatchObservation = { observation_id: "batch-a2", load_generation: 42, session_id: request.session_id,
    logical_ordinal: 1, logical_rows: 17, mixed_physical_batches: 0, stage_ms: 1, idle_ms: 0, idle_gated: 0, ready_rows: 17, ready_sequences: 7,
    physical_batches: [1, 2, 3, 4, 7].map((count, execution_id) => ({ execution_id, rows: count, prefill_rows: 0, decode_rows: 0,
      verify_rows: count, replay_rows: 0, request_count: count, sequence_count: count, owned_requests: Array.from({ length: count }, (_, index) => owner(index)) })) };
  const type = "application/vnd.p4.llamacpp.batch-observation-v5+json";
  emit(original, type, observation);
  // 새 event ID라도 같은 stage의 observation ID가 같으면 중복이다.
  emit(original, type, observation);
  const tail = { ...original, target: { ...original.target, kind: "node" as const, nodeId: "tail", generation: 9 } };
  // 다른 stage의 물리 실행은 별도 표본으로 누적한다.
  emit(tail, type, observation);
  emit(tail, type, observation);
  complete(original, 0); await vi.advanceTimersByTimeAsync(3000);
  const expected = { buckets: [2, 2, 2, 2, 2], batches: 10, requests: 34, multiRequestBatches: 8 };
  const run = inference.runModel(id).value!;
  expect(run.error).toBeNull(); expect(run.state).toBe("completed");
  expect(run.batchRequestDistributions?.all).toEqual(expected);
  expect(run.batchRequestDistributions?.verify).toEqual(expected);
  expect(run.batchRequestDistributions?.replay.batches).toBe(0);
  const saved = vi.mocked(window.localStorage.setItem).mock.calls.filter(([key]) => key === "p4studio.inference.history.v1").at(-1)![1];
  expect(JSON.parse(saved).runs[0].batchRequestDistributions.all).toEqual(expected);
  // 저장 DTO를 새 API/model 인스턴스가 실제 restore 경로로 읽는다.
  vi.resetModules();
  vi.stubGlobal("window", { localStorage: { getItem: () => saved, setItem: vi.fn() }, addEventListener: vi.fn(), setTimeout, clearTimeout });
  const restoredApi = await import("./api.js"), restored = await import("@p4studio/studio_domain/front");
  restoredApi.startInference(); await restored.inference.refresh();
  expect(restored.inference.runModel(id).value?.batchRequestDistributions?.all).toEqual(expected);
  expect(restored.inference.runModel(id).value?.batchRequestDistributions?.verify).toEqual(expected);
});
