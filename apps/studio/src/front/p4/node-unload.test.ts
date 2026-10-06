import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeLifecycleMetadata } from "@p4studio/p4-protocol";
const probe = vi.hoisted(() => ({ timeout: 0, receiptWrites: 0 }));
vi.mock("./lease.js", () => ({ acquireOperationLease: async () => ({ release: async () => {} }) }));
vi.mock("./reception.js", () => ({
  readAgentTopology: async () => ({ agents: [{ id: "agent", name: "Agent", host: "head", port: 52000 }], groups: [] }),
  BrowserP4Reception: class { operationId = "unload-operation";
    async exchange(target: unknown, _adapter: unknown, _type: unknown, _payload: unknown, _terminal: unknown, timeout: number) {
      probe.timeout = timeout;
      return { source: target, adapterKind: null, contentType: "application/vnd.p4.node.lifecycle-result-v1", payload: encodeLifecycleMetadata({ schema: 1, node_id: "head", node_generation: 9, adapter_kind: "llamacpp", adapter_content_type: "application/vnd.p4.llamacpp.error-v2+json", operation: "unload", status: "rejected", resource_state: "present", first_error: "unload is busy", cleanup_error: null }, new Uint8Array()) };
    }
    close() {}
  },
}));
beforeEach(() => { vi.resetModules(); probe.timeout = 0; probe.receiptWrites = 0; });
afterEach(() => vi.unstubAllGlobals());
async function unload() {
  const { emptyDeployment, emptyStage, nodeUnload } = await import("@p4studio/studio_domain/front");
  const record = { ...emptyDeployment(), name: "Model", id: "model", status: "loaded", loadGeneration: 42, timeoutMs: 3_600_000, operationId: "load", error: "", createdAt: "now", updatedAt: "now", resolvedAddresses: { agent: "tcp://head:52000" }, stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head", nodeGeneration: 9 }], reports: [{ stageId: "head", state: "loaded", loadOutcome: "succeeded", resourceState: "present", detail: "", telemetry: null, updatedAt: "now" }] };
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => { if (init?.method === "PUT") { probe.receiptWrites++; Object.assign(record, JSON.parse(String(init.body))); return new Response(JSON.stringify(record), { status: 200 }); } return new Response(JSON.stringify({ deployments: [record] }), { status: 200 }); });
  await import("./node-unload.js");
  await nodeUnload.unload({ agentId: "agent", nodeId: "head", nodeGeneration: 9, adapterKind: "llamacpp" });
}
it("AUD-12: node UNLOAD rejection must leave a durable lifecycle failure receipt", async () => { await unload(); expect(probe.receiptWrites).toBeGreaterThan(0); });
it("AUD-13: node UNLOAD must use the same bounded wait as model UNLOAD", async () => { await unload(); expect(probe.timeout).toBeLessThanOrEqual(120_000); });
