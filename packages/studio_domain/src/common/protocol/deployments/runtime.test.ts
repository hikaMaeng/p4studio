import { describe, expect, it } from "vitest";
import { runBrowserDeployment, type BrowserOwnedDeploymentTransport } from "./runtime.js";
import type { DeploymentRecord } from "./index.js";

describe("browser-owned deployment runner", () => {
  it("records an interrupted bridge delivery as unknown, not a confirmed load failure", async () => {
    const record = {
      id: "deployment", name: "test", adapter: "custom", ingressAgentId: "agent", totalLayers: 1, contextSize: 1, sequenceCapacity: 1, nBatch: 1, nUbatch: 1, timeoutMs: 100,
      loadContentType: "application/x.load", loadedContentType: "application/x.loaded", unloadContentType: "application/x.unload", unloadedContentType: "application/x.unloaded", errorContentType: "application/x.error",
      stages: [{ id: "stage", agentId: "agent", nodeId: "node", nodeGeneration: 1, createNode: false, artifact: "", layerStart: 0, layerEnd: 1, binary: "", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}" }],
      status: "loading", loadGeneration: 1, operationId: "operation", error: "", reports: [], resolvedAddresses: { agent: "tcp://127.0.0.1:51055" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as DeploymentRecord;
    const transport: BrowserOwnedDeploymentTransport = { exchange: async () => { const error = new Error("bridge closed"); error.name = "UncertainP4Delivery"; throw error; }, close() {} };
    await runBrowserDeployment(record, "load", new Map([["agent", "tcp://127.0.0.1:51055"]]), transport, async () => {});
    expect(record.status).toBe("unknown");
    expect(record.reports[0]).toMatchObject({ state: "unknown", loadRequested: true });
  });
});
