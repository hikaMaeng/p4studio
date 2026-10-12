import { expect, it, vi } from "vitest";
import type { InferenceRun } from "../../../common/protocol/inference/index.js";
import { InferenceStore, type InferenceGateway } from "./store.js";
import { inferenceRequestSchema, parseP4SpeculativeRound } from "../../../common/protocol/inference/index.js";
import { recordSpeculativeRound } from "./speculative/index.js";

const run = (id: string): InferenceRun => ({
  id, modelId: "model", modelName: "Model", state: "completed", submitted: 1, completed: 1,
  createdAt: "2026-10-04T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: [],
});

it("publishes the first speculative observation immediately within the normal chart throttle", async () => {
  const active = { ...run("live"), loadGeneration: 42, state: "running" as const,
    requests: [inferenceRequestSchema.parse({ id: "request", state: "queued", prompt: "", text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, submittedAt: "", completedAt: null, error: null })] };
  let deliver: (value: InferenceRun) => void = () => {};
  const gateway = { list: async () => [active], subscribe: (_id: string, listener: typeof deliver) => { deliver = listener; return () => {}; } } as unknown as InferenceGateway;
  const store = new InferenceStore(); store.start(gateway); await vi.waitFor(() => expect(store.runIds.value).toEqual(["live"]));
  const projection = store.runObservabilityModel("live");
  const changed = vi.fn(); projection.subscribe(changed);
  recordSpeculativeRound(active, parseP4SpeculativeRound({ observation_id: "one", load_generation: 42, session_id: "live", request_id: "request", reply: { ingress_agent: "tcp://head:52000", channel: "outer", connection_generation: 1, correlation_id: "operation" }, sequence_id: 0, incarnation: 1, position: 12, drafted: 3, accepted: 2, path: "direct", emitted_tokens: 1 }), Date.now());
  deliver(active);
  expect(changed).toHaveBeenCalledOnce(); expect(projection.value!.speculative!.accepted).toBe(2);
});

it("removes only the selected completed run", async () => {
  const stopped = new Set<string>();
  const gateway = {
    list: vi.fn(async () => [run("run-1"), run("run-2")]),
    remove: vi.fn(),
    subscribe: vi.fn((id: string) => () => { stopped.add(id); }),
  } as unknown as InferenceGateway;
  const store = new InferenceStore();
  store.start(gateway);
  await vi.waitFor(() => expect(store.runs.value.map(value => value.id)).toEqual(["run-1", "run-2"]));

  await store.remove("run-1");

  expect(store.runs.value.map(value => value.id)).toEqual(["run-2"]);
  expect(gateway.remove).toHaveBeenCalledWith("run-1");
  expect(stopped.size).toBe(0);
});
it("keeps the run visible and refreshes a stale view when durable deletion is rejected", async () => {
  const current = { ...run("run"), state: "unknown" as const, pendingSettlement: 10 };
  let latest = run("run"); const gateway = { list: async () => [latest], remove: async () => { latest = current; throw new Error("committed inference owns unsettled work"); } } as unknown as InferenceGateway;
  const store = new InferenceStore(); store.start(gateway); await vi.waitFor(() => expect(store.runIds.value).toEqual(["run"]));
  await store.remove("run"); expect(store.runIds.value).toEqual(["run"]); expect(store.runModel("run").value).toMatchObject({ pendingSettlement: 10 }); expect(store.activity.value.error).toContain("unsettled work");
});

it("keeps an active run and its subscription until cancellation settles", async () => {
  const active = { ...run("live"), state: "running" as const };
  const unsubscribe = vi.fn(); let deliver: (value: InferenceRun) => void = () => {};
  const gateway = { list: async () => [active], remove: vi.fn(), cancel: vi.fn(async () => {}), subscribe: (_id: string, onRun: typeof deliver) => { deliver = onRun; return unsubscribe; } } as unknown as InferenceGateway;
  const store = new InferenceStore(); store.start(gateway);
  await vi.waitFor(() => expect(store.runIds.value).toEqual(["live"]));
  expect(store.activeRunIds.value).toEqual(["live"]);
  store.remove("live"); expect(gateway.remove).not.toHaveBeenCalled(); expect(unsubscribe).not.toHaveBeenCalled();
  await store.cancel("live"); expect(gateway.cancel).toHaveBeenCalledWith("live");
  deliver({ ...active, state: "cancelling" }); expect(unsubscribe).not.toHaveBeenCalled(); expect(store.activeRunIds.value).toEqual(["live"]);
  deliver({ ...active, state: "cancelled" }); expect(unsubscribe).toHaveBeenCalledTimes(1); expect(store.activeRunIds.value).toEqual([]);
});

it("retains older active runs after a newer run finishes and only publishes active membership changes", async () => {
  const live = { ...run("older"), state: "running" as const };
  const deliver = new Map<string, (value: InferenceRun) => void>();
  const gateway = { list: async () => [run("newer"), live], subscribe: (id: string, onRun: (value: InferenceRun) => void) => { deliver.set(id, onRun); return () => {}; } } as unknown as InferenceGateway;
  const store = new InferenceStore(); store.start(gateway);
  await vi.waitFor(() => expect(store.runIds.value).toEqual(["newer", "older"]));
  expect(store.activeRunIds.value).toEqual(["older"]);
  const changed = vi.fn(); store.activeRunIds.subscribe(changed);
  deliver.get("older")!({ ...live, completed: 0 }); expect(changed).not.toHaveBeenCalled();
  deliver.get("older")!({ ...live, state: "cancelling" }); expect(changed).not.toHaveBeenCalled();
  deliver.get("older")!({ ...live, state: "cancelled" });
  expect(store.activeRunIds.value).toEqual([]); expect(changed).toHaveBeenCalledTimes(1);
});
