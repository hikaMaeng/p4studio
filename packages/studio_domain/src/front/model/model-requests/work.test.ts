import { expect, it } from "vitest";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { emptyDeployment, emptyStage } from "../deployments/store.js";
import { parseDeployment } from "../../../common/protocol/deployments/index.js";
import { observeModelRequests } from "./work.js";
const model = parseDeployment({ ...emptyDeployment(), id: "model", name: "model", loadGeneration: 42, operationId: "load", status: "loaded", createdAt: "now", updatedAt: "now", error: "", reports: [], resolvedAddresses: {}, stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head", nodeGeneration: 9 }] });
const snapshot = (state: unknown, generation = 9, loadGeneration = 42) => ({ generatedAtUnixMs: Date.now(), nodes: [{ nodeId: "head", generation, loadGeneration, adapterKind: "llamacpp", state }] }) as P4AgentSnapshot;
it("reads the owned work census without adding pending requests to admitted requests", () => {
  const result = observeModelRequests(model, new Map([["agent", snapshot('failed:reason;previous=loaded;work={"requests":38,"pending":18,"active_owners":20,"flight_batches":4,"receive":{"uncertain":1}}')]]), "now");
  expect(result[0]).toMatchObject({ state: "observed", requests: 38, pending: 18, activeOwners: 20, flights: 4 });
});
it("never turns unsupported counters, unreachable agents, stale samples or another generation into zero", () => {
  for (const value of [snapshot("loaded"), snapshot('work={"requests":-1,"pending":"0"}'), snapshot('work={"requests":0}', 10), snapshot('work={"requests":0}', 9, 43), new Error("disconnected"), { ...snapshot("loaded"), generatedAtUnixMs: Date.now() - 60_000 }]) {
    expect(observeModelRequests(model, new Map([["agent", value]]), "now")[0]?.requests).toBeNull();
  }
  expect(observeModelRequests(model, new Map([["agent", { ...snapshot("loaded"), nodes: [] }]]), "now")[0]).toMatchObject({ state: "absent", requests: 0 });
});
