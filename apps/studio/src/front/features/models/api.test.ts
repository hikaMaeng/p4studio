import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DeploymentGateway } from "@p4studio/studio_domain/front";
const probe = vi.hoisted(() => ({ gateway: undefined as DeploymentGateway | undefined, barrier: vi.fn(), topology: vi.fn() }));
vi.mock("@p4studio/studio_domain/front", () => ({
  deployments: { start: (gateway: DeploymentGateway) => { probe.gateway = gateway; } },
  reconcileDeployment: vi.fn(),
  inferenceExecutions: { unload: probe.barrier },
}));
vi.mock("../../p4/reception.js", () => ({ readAgentTopology: probe.topology, BrowserP4Reception: class {} }));
vi.mock("../../p4/inspection.js", () => ({ inspectGraphAgent: vi.fn() }));
let record: any;
beforeEach(async () => {
  vi.resetModules(); probe.barrier.mockReset(); probe.topology.mockReset();
  record = { id: "model", name: "Model", adapter: "llamacpp", status: "loaded", loadGeneration: 43,
    totalLayers: 1, contextSize: 512, sequenceCapacity: 8, nBatch: 128, nUbatch: 128, timeoutMs: 100,
    operationId: "load43", error: "", createdAt: "now", updatedAt: "revision43", stages: [], reports: [],
    loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "" };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ deployments: [record] })));
  const { startModels } = await import("./api.js"); startModels();
});
afterEach(() => vi.unstubAllGlobals());
it.each([42, 0])("rejects old or unknown generation %s before cancelling the current owner", async generation => {
  await expect(probe.gateway!.operate("model", "unload", generation)).rejects.toThrow("different or unknown LOAD generation");
  expect(probe.barrier).not.toHaveBeenCalled(); expect(probe.topology).not.toHaveBeenCalled();
});
it("keeps the matching captured generation across the cancellation barrier", async () => {
  probe.barrier.mockImplementation(async (_record, proceed) => { record.loadGeneration = 44; return proceed(); });
  await expect(probe.gateway!.operate("model", "unload", 43)).rejects.toThrow("placement changed");
  expect(probe.barrier).toHaveBeenCalledOnce(); expect(probe.topology).not.toHaveBeenCalled();
});
it("preserves ordinary current-model UNLOAD and exact-generation recovery", async () => {
  probe.barrier.mockImplementation(async captured => captured);
  expect((await probe.gateway!.operate("model", "unload", 43)).loadGeneration).toBe(43);
  expect((await probe.gateway!.operate("model", "unload")).loadGeneration).toBe(43);
});
