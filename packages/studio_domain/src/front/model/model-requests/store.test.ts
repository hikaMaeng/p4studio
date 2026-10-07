import { expect, it } from "vitest";
import { requestsForModel } from "./store.js";
import { emptyDeployment, emptyStage } from "../deployments/store.js";
import { parseDeployment } from "../../../common/protocol/deployments/index.js";
it("retains a busy clear failure when the automatic follow-up inspection succeeds", async () => {
  const model = requestsForModel(crypto.randomUUID());
  const record = parseDeployment({ ...emptyDeployment(), id: "model", name: "model", status: "loaded", loadGeneration: 42, operationId: "load", createdAt: "now", updatedAt: "now", error: "", reports: [], resolvedAddresses: {}, stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head" }] });
  const data = { owners: [], stages: [], observedAt: new Date().toISOString() };
  const unwatch = model.watch(record, { inspect: async () => data, clear: async () => { throw new Error("unload is busy"); } });
  try { await Promise.resolve(); await model.clear(); expect(model.activity.value.error).toContain("unload is busy"); expect(model.activity.value.cleared).toBe(false); await model.refresh(); expect(model.activity.value.error).toContain("unload is busy"); }
  finally { unwatch(); }
});
