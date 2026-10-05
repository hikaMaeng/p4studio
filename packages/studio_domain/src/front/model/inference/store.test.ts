import { expect, it, vi } from "vitest";
import type { InferenceRun } from "../../../common/protocol/inference/index.js";
import { InferenceStore, type InferenceGateway } from "./store.js";

const run = (id: string): InferenceRun => ({
  id, modelId: "model", modelName: "Model", state: "completed", submitted: 1, completed: 1,
  createdAt: "2026-10-04T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: [],
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

  store.remove("run-1");

  expect(store.runs.value.map(value => value.id)).toEqual(["run-2"]);
  expect(gateway.remove).toHaveBeenCalledWith("run-1");
  expect(stopped.size).toBe(0);
});

it("keeps an active run and its subscription until cancellation settles", async () => {
  const active = { ...run("live"), state: "running" as const };
  const unsubscribe = vi.fn(); let deliver: (value: InferenceRun) => void = () => {};
  const gateway = { list: async () => [active], remove: vi.fn(), cancel: vi.fn(async () => {}), subscribe: (_id: string, onRun: typeof deliver) => { deliver = onRun; return unsubscribe; } } as unknown as InferenceGateway;
  const store = new InferenceStore(); store.start(gateway);
  await vi.waitFor(() => expect(store.runIds.value).toEqual(["live"]));
  store.remove("live"); expect(gateway.remove).not.toHaveBeenCalled(); expect(unsubscribe).not.toHaveBeenCalled();
  await store.cancel("live"); expect(gateway.cancel).toHaveBeenCalledWith("live");
  deliver({ ...active, state: "cancelling" }); expect(unsubscribe).not.toHaveBeenCalled();
  deliver({ ...active, state: "cancelled" }); expect(unsubscribe).toHaveBeenCalledTimes(1);
});
