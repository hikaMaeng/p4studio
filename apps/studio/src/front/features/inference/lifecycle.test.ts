// Independent consumer regression tests promoted from the lifecycle audit.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { P4Endpoint, P4Event } from "@p4studio/p4-protocol";
import { P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE, P4_SCOPE_CLOSED_CONTENT_TYPE } from "@p4studio/studio_domain/common";
vi.mock("../../p4/lease.js", () => ({ acquireOperationLease: async () => ({ release: async () => {}, checkpoint: async () => {} }) }));

const wire = vi.hoisted(() => ({ events: [] as P4Event[], listeners: new Set<(event: P4Event, at: number) => void>(), closed: false }));
vi.mock("../../p4/reception.js", () => ({
  readAgentTopology: async () => ({ agents: [{ id: "agent", name: "Agent", host: "head", port: 52000 }], groups: [] }),
  BrowserP4Reception: class {
    async retainDispatchConnection() {}
    operationId = "operation";
    dispatchIdentity() { return { outer: { kind: "outer" as const, address: "head:52000", channel: "outer", generation: 1 }, nextSequence: wire.events.length + 1 }; }
    async exchange(target: P4Endpoint, _adapter: string, _type: string, body: unknown) {
      return { source: target, contentType: "application/vnd.p4.llamacpp.session-ready-v4+json", payload: new TextEncoder().encode(JSON.stringify({ state: "ready", ...body as object })) };
    }
    dispatch(target: P4Endpoint, adapterKind: string, contentType: string, body: unknown, eventClass: number, deadline: number | null = null) {
      const source: P4Endpoint = { kind: "outer", address: "head:52000", channel: "outer", generation: 1 };
      const event: P4Event = { eventId: crypto.randomUUID(), correlationId: this.operationId, causationId: null, source, target, returnRoute: source, class: eventClass, sequence: wire.events.length + 1, deadline, adapterKind, contentType, payload: new TextEncoder().encode(JSON.stringify(body)) };
      wire.events.push(event); return { event, sentAt: new Date().toISOString(), sentAtMs: performance.now() };
    }
    owns() { return true; }
    onEvent(listener: (event: P4Event, at: number) => void) { wire.listeners.add(listener); return () => wire.listeners.delete(listener); }
    async close() { wire.closed = true; return true; }
  },
}));
vi.mock("../../p4/inspection.js", () => ({ inspectGraphAgent: async () => { throw new Error("No fixture monitoring"); } }));
vi.mock("../models/api.js", () => ({ recordSessionProof: async () => {} }));
let model: any;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  wire.events = []; wire.listeners.clear(); wire.closed = false;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() }, addEventListener: vi.fn(), setTimeout, clearTimeout });
  const stage = { agentId: "agent", nodeGeneration: 9, artifact: "model.gguf", layerStart: 0, layerEnd: 1, binary: "binary", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 20, max_output_tokens_per_request: 100, max_output_tokens: 2000 } }) };
  model = { id: "model", name: "Model", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 100, error: "", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", resolvedAddresses: { agent: "head:52000" }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail" }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", updatedAt: "", telemetry: null })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ deployments: [model] }), { status: 200 }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function start(settings = { concurrency: 2, repetitions: 1, intervalMs: 0 }) {
  const { startInference } = await import("./api.js");
  const { inference, inferenceExecutions } = await import("@p4studio/studio_domain/front");
  startInference(); await inference.create({ modelId: "model", prompt: "TypeScript 설명", ...settings, maxTokens: 100 });
  await vi.advanceTimersByTimeAsync(250);
  const id = inference.runIds.value[0]!;
  return { inference, inferenceExecutions, id };
}
const prefills = () => wire.events.filter(event => event.contentType.includes("prefill-v3"));
const scopeCloses = () => wire.events.filter(event => event.contentType.includes("scope-close-v1"));
const closeScope = () => {
  const event = scopeCloses().at(-1)!;
  const reply: P4Event = { ...event, eventId: crypto.randomUUID(), source: event.target, target: event.source, returnRoute: event.source as Extract<P4Endpoint, { kind: "outer" }>, class: 0, causationId: event.eventId, contentType: P4_SCOPE_CLOSED_CONTENT_TYPE,
    payload: new TextEncoder().encode(JSON.stringify({ load_generation: 42, status: "closed", native_kv_stop_proven: true })) };
  wire.listeners.forEach(listener => listener(reply, performance.now()));
};
it("does not start SESSION when a durable owner record cannot be written", async () => {
  vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error("QuotaExceededError"); });
  const { inference } = await start();
  expect(wire.events).toHaveLength(0); expect(inference.runIds.value).toHaveLength(0);
  expect(inference.activity.value.error).toContain("durable owner record");
});
it("keeps legacy unknown settlement but permits a proved newer LOAD generation", async () => {
  model.loadStartedAt = "2026-10-06T00:00:00.000Z";
  vi.mocked(window.localStorage).getItem = () => JSON.stringify({ timingVersion: 3, runs: [{ id: "legacy", modelId: "model", modelName: "Model", state: "unknown", pendingSettlement: 2, submitted: 2, completed: 0, createdAt: "2026-10-05T00:00:00Z", error: "original owner lost", requests: [] }] });
  const { inference } = await start();
  expect(prefills()).toHaveLength(2);
  expect(inference.runModel("legacy").value).toMatchObject({ state: "unknown", pendingSettlement: 2 });
});
it("does not use legacy timestamps without newer LOAD proof to bypass settlement", async () => {
  vi.mocked(window.localStorage).getItem = () => JSON.stringify({ timingVersion: 3, runs: [{ id: "legacy", modelId: "model", modelName: "Model", state: "unknown", pendingSettlement: 2, submitted: 2, completed: 0, createdAt: "2026-10-05T00:00:00Z", error: "original owner lost", requests: [] }] });
  const { inference } = await start(); expect(prefills()).toHaveLength(0); expect(inference.activity.value.error).toContain("settlement is unknown");
});
it("stops later waves and closes the original OUTER scope if its durable checkpoint fails", async () => {
  const { inference, id } = await start({ concurrency: 2, repetitions: 3, intervalMs: 5000 });
  expect(prefills()).toHaveLength(2);
  vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error("QuotaExceededError"); });
  await vi.advanceTimersByTimeAsync(5500);
  expect(prefills()).toHaveLength(2); expect(scopeCloses()).toHaveLength(1);
  expect(inference.runModel(id).value?.state).toBe("unknown");
});
const body = (event: P4Event) => JSON.parse(new TextDecoder().decode(event.payload));
function emit(original: P4Event, contentType: string, payload: unknown, changes: Partial<P4Event> = {}) {
  const reply: P4Event = { ...original, eventId: crypto.randomUUID(), source: original.target, target: original.source, class: contentType === P4_RELEASE_RECEIPT_CONTENT_TYPE ? 3 : 2, causationId: original.eventId, contentType, payload: new TextEncoder().encode(JSON.stringify(payload)), ...changes };
  wire.listeners.forEach(listener => listener(reply, performance.now()));
}
function error(original: P4Event, changes: Partial<P4Event> = {}, requestId = body(original).request_id) {
  emit(original, P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_ADAPTER_EVENT_REJECTED", detail: "request storage budget exhausted: limit.requests=20", submission: { load_generation: 42, session_id: body(original).session_id, request_id: requestId, submission_event_id: original.eventId } }, changes);
}
function complete(original: P4Event, sequence = 0) {
  emit(original, "application/vnd.p4.llamacpp.output-v6+json", { load_generation: 42, session_id: body(original).session_id, request_id: body(original).request_id, submission_event_id: original.eventId, sequence_id: sequence, incarnation: 3, token: 1, text: "answer", position: 0, stop: "length", output_ordinal: 0, release_operation_id: 10 });
}

it("AUD-01: a refused submission must not mark another accepted request failed", async () => {
  const { inference, id } = await start(); error(prefills()[1]!); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value!.requests[0]!.state).not.toBe("failed");
});
it.each(["max_input_tokens", "max_request_bytes", "max_request_retained_bytes"])("rejects insufficient %s before any SESSION or PREFILL", async field => {
  for (const stage of model.stages) { const options = JSON.parse(stage.loadOptionsJson); options.resource_profile[field] = 1; stage.loadOptionsJson = JSON.stringify(options); }
  const { inference } = await start(); expect(wire.events).toHaveLength(0); expect(inference.activity.value.error).toContain("conservative input estimate");
});
it("AUD-02: error recovery closes the original scope before retiring its return connection", async () => {
  await start(); error(prefills()[1]!); await vi.advanceTimersByTimeAsync(50);
  expect(scopeCloses().length).toBe(1);
});
it("AUD-03: UNLOAD after a request error must retain and settle the original live owners", async () => {
  const { inferenceExecutions } = await start(); error(prefills()[1]!); await vi.advanceTimersByTimeAsync(50);
  let closeCountAtUnload = -1;
  const unloading = inferenceExecutions.unload(model, async () => { closeCountAtUnload = scopeCloses().length; });
  const original = prefills()[0]!;
  emit(original, P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_REQUEST_CANCELLED", detail: "cancelled", owner: { load_generation: 42, session_id: body(original).session_id, request_id: body(original).request_id, incarnation: 3 } });
  emit(original, P4_RELEASE_RECEIPT_CONTENT_TYPE, { load_generation: 42, session_id: body(original).session_id, members: [{ request_id: body(original).request_id, submission_event_id: original.eventId, incarnation: 3, sequence_id: 0, operation_id: 10 }] });
  closeScope(); await vi.advanceTimersByTimeAsync(25); await unloading;
  expect(closeCountAtUnload).toBeGreaterThan(0);
});
it("AUD-04: natural terminal OUTPUT must retain the return route until RELEASE", async () => {
  await start({ concurrency: 1, repetitions: 1, intervalMs: 0 }); complete(prefills()[0]!); await vi.advanceTimersByTimeAsync(50);
  expect(wire.closed).toBe(false);
});
it("AUD-05: a stale ERROR correlation must not abort the current run", async () => {
  const { inference, id } = await start(); error(prefills()[1]!, { correlationId: "old-operation" }); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value!.state).toBe("running");
});
it("AUD-06: ERROR ownership must be validated against the exact submission", async () => {
  const { inference, id } = await start(); error(prefills()[1]!, {}, "foreign-request"); await vi.advanceTimersByTimeAsync(50);
  expect(inference.runModel(id).value!.state).toBe("running");
});
it("AUD-07: 10x10 waves must not blindly overrun the captured 20-request LOAD budget", async () => {
  await start({ concurrency: 10, repetitions: 10, intervalMs: 5000 });
  await vi.advanceTimersByTimeAsync(10_000);
  // Capacity expansion, explicit refusal before dispatch, or a pending queue may meet this oracle.
  // This does not assert sequence_capacity=8 is the request-admission ceiling.
  expect(prefills().length).toBeLessThanOrEqual(20);
});
it("AUD-C1: happy SESSION proof still submits the requested first wave", async () => {
  const { inference, id } = await start();
  expect(prefills()).toHaveLength(2); expect(inference.runModel(id).value!.state).toBe("running");
});
