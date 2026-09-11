import { describe, expect, it, vi } from "vitest";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { GraphInventoryStore, type GraphInventoryGateway } from "./store.js";

describe("graph inventory", () => {
  it("deduplicates reload and preserves the last observation on failure", async () => {
    const store = new GraphInventoryStore();
    let resolve!: (value: P4AgentSnapshot) => void;
    const gateway: GraphInventoryGateway = { inspect: vi.fn(() => new Promise<P4AgentSnapshot>(r => { resolve = r; })), labels: async () => [], renameAgent: vi.fn(), renameNode: vi.fn() };
    store.start(gateway);
    const agent = { id: "a", name: "A", host: "host", port: 1232 };
    const first = store.refresh(agent);
    await store.refresh(agent);
    expect(gateway.inspect).toHaveBeenCalledTimes(1);
    const observation = { nodes: [{ nodeId: "node-1", generation: 7, adapterKind: "example", state: {} }] } as P4AgentSnapshot;
    resolve(observation); await first;
    expect(store.observations.value.get("a")?.snapshot).toBe(observation);
    gateway.inspect = async () => { throw new Error("agent offline"); };
    await store.refresh(agent);
    expect(store.observations.value.get("a")?.snapshot).toBe(observation);
    expect(store.refreshState.value.get("a")).toEqual({ busy: false, error: "agent offline" });
  });
  it("keeps a failed rename editable, then saves metadata for the original ID", async () => {
    const store = new GraphInventoryStore();
    const renameNode = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ agentId: "a", nodeId: "n", name: "Friendly", updatedAt: "2026-09-11" });
    store.start({ inspect: vi.fn(), labels: async () => [], renameAgent: vi.fn(), renameNode });
    store.edit({ kind: "node", agentId: "a", nodeId: "n" }, "Friendly");
    await store.saveName();
    expect(store.draft.value).toMatchObject({ name: "Friendly", busy: false, failed: true });
    await store.saveName();
    expect(renameNode).toHaveBeenLastCalledWith("a", { nodeId: "n", name: "Friendly" });
    expect(store.draft.value).toBeNull();
    expect([...store.labels.value.values()]).toMatchObject([{ nodeId: "n", name: "Friendly" }]);
  });
});
