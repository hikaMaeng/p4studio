import { afterEach, expect, it, vi } from "vitest";
import { decodeP4Event, encodeP4Event, frameP4Event, type P4Event } from "@p4studio/p4-protocol";
vi.mock("./lease.js", () => ({ acquireOperationLease: async () => ({ release: async () => {}, checkpoint: async () => {} }) }));

class Socket extends EventTarget {
  static OPEN = 1;
  static all: Socket[] = [];
  static submissions: P4Event[] = [];
  readyState = 1;
  constructor() { super(); Socket.all.push(this); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
  send(value: string | ArrayBuffer) {
    if (typeof value === "string") {
      const control = JSON.parse(value);
      if (control.type === "open") queueMicrotask(() => this.message(JSON.stringify({ ...control, type: "opened" })));
      return;
    }
    if (value.byteLength === 4) { queueMicrotask(() => this.message(value)); return; }
    const event = decodeP4Event(new Uint8Array(value).slice(4));
    if (event.contentType.includes("prefill-v3")) Socket.submissions.push(event);
    if (event.contentType.includes("session-v4")) {
      const body = JSON.parse(new TextDecoder().decode(event.payload));
      const reply: P4Event = { ...event, eventId: crypto.randomUUID(), causationId: event.eventId, source: event.target, target: event.source, class: 3, contentType: "application/vnd.p4.llamacpp.session-ready-v4+json", payload: new TextEncoder().encode(JSON.stringify({ state: "ready", session_id: body.session_id, load_generation: body.load_generation })) };
      queueMicrotask(() => this.message(frameP4Event(encodeP4Event(reply)).buffer as ArrayBuffer));
    }
  }
  message(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
  close() { this.readyState = 3; }
  disconnect() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}
vi.mock("./inspection.js", () => ({ inspectGraphAgent: async () => { throw new Error("No fixture monitoring"); } }));
vi.mock("../features/models/api.js", () => ({ recordSessionProof: async () => {} }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); Socket.all = []; Socket.submissions = []; });
it("AUD-09: real connection/reception must expose bridge disconnection to the inference run", async () => {
  vi.useFakeTimers(); vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() }, addEventListener: vi.fn(), setTimeout, clearTimeout });
  const stage = { agentId: "00000000-0000-4000-8000-000000000001", nodeGeneration: 9, artifact: "model.gguf", layerStart: 0, layerEnd: 1, binary: "binary", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}", loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 20, max_output_tokens_per_request: 100, max_output_tokens: 2000 } }) };
  const model = { id: "model", name: "Model", adapter: "llamacpp", status: "loaded", loadGeneration: 42, operationId: "load", totalLayers: 2, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 100, error: "", createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", resolvedAddresses: { [stage.agentId]: "head:52000" }, stages: [{ ...stage, id: "head", nodeId: "head" }, { ...stage, id: "tail", nodeId: "tail" }], reports: ["head", "tail"].map(stageId => ({ stageId, state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", updatedAt: "", telemetry: null })), loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
  vi.stubGlobal("fetch", async (path: string) => new Response(JSON.stringify(path.includes("graph-agents") ? { agents: [{ id: stage.agentId, name: "Agent", host: "head", port: 52000 }], groups: [] } : { deployments: [model] }), { status: 200 }));
  const { startInference } = await import("../features/inference/api.js");
  const { inference } = await import("@p4studio/studio_domain/front");
  startInference(); await inference.create({ modelId: "model", prompt: "prompt", concurrency: 1, repetitions: 1, intervalMs: 0, maxTokens: 100 });
  await vi.advanceTimersByTimeAsync(250); expect(Socket.submissions).toHaveLength(1);
  const id = inference.runIds.value[0]!; expect(inference.runModel(id).value!.state).toBe("running");
  Socket.all[0]!.disconnect(); await vi.advanceTimersByTimeAsync(60_000);
  expect(inference.runModel(id).value!.state).toBe("unknown");
});
