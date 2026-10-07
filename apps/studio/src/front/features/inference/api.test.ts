import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { P4Endpoint, P4Event } from "@p4studio/p4-protocol";
import { P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE, P4_SCOPE_CLOSED_CONTENT_TYPE } from "@p4studio/studio_domain/common";
vi.mock("../../p4/lease.js", () => ({ acquireOperationLease: async () => ({ release: async () => {}, checkpoint: async () => {} }) }));

const wire = vi.hoisted(() => ({ events: [] as P4Event[], retained: [] as P4Endpoint[], sentTimes: [] as number[], listeners: new Set<(event: P4Event, at: number) => void>(), holdSession: false, resume: undefined as (() => void) | undefined, closed: false }));
vi.mock("../../p4/reception.js", () => ({
  readAgentTopology: async () => ({ agents: [{ id: "agent", name: "Agent", host: "head", port: 52000 }], groups: [] }),
  BrowserP4Reception: class {
    operationId = "operation";
    async retainDispatchConnection(target: P4Endpoint) { wire.retained.push(target); }
    dispatchIdentity() { return { outer: { kind: "outer" as const, address: "head:52000", channel: "outer", generation: 1 }, nextSequence: wire.events.length + 1 }; }
    async exchange(target: P4Endpoint, _adapter: string, _type: string, body: { session_id: string; load_generation: number }) {
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
  vi.resetModules(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }); wire.events = []; wire.retained = []; wire.sentTimes = []; wire.listeners.clear(); wire.holdSession = false; wire.resume = undefined; wire.closed = false;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() }, addEventListener: vi.fn(), setTimeout, clearTimeout });
  const stage = { agentId: "agent", nodeGeneration: 9, artifact: "model.gguf", layerStart: 0, layerEnd: 1, binary: "binary", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 100, max_output_tokens_per_request: 100, max_output_tokens: 10000 } }) };
  const model = { id: "model", name: "Model", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 100, error: "", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", resolvedAddresses: { agent: "head:52000" }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail" }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", updatedAt: "", telemetry: null })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ deployments: [model] }), { status: 200 }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start(settings = { concurrency: 2, repetitions: 3, intervalMs: 60_000 }) {
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
