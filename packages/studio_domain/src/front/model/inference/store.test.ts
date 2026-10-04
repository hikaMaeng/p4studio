import { expect, it, vi } from "vitest";
import type { InferenceRun } from "../../../common/protocol/inference/index.js";
import { InferenceStore, type InferenceGateway } from "./store.js";

const run = (id: string): InferenceRun => ({
  id, modelId: "model", modelName: "Model", state: "running", submitted: 1, completed: 0,
  createdAt: "2026-10-04T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: [],
});

it("removes only the selected run and stops its subscription", async () => {
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
  expect(stopped).toEqual(new Set(["run-1"]));
});
