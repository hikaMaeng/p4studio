import { expect, it } from "vitest";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { emptyDeployment, emptyStage } from "./store.js";
import { reconcileDeployment } from "./reconcile.js";
import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";
import { canStartDeployment } from "../../../common/protocol/deployments/lifecycle.js";

it("AUD-10: forced agent reset must not convert an UNLOAD rejection into normal UNLOAD completion", () => {
  const record: DeploymentRecord = { ...emptyDeployment(), id: "model", name: "TUF", status: "failed", loadGeneration: 42, operationId: "unload", error: "unload is busy", resolvedAddresses: {}, sessionProof: null, createdAt: "now", updatedAt: "now", stages: [{ ...emptyStage(), id: "head", agentId: "tuf", nodeId: "head", nodeGeneration: 9 }], reports: [{ stageId: "head", state: "failed", loadRequested: true, loadOutcome: "succeeded", resourceState: "present", detail: "unload is busy", failureDetail: "", cleanupError: "unload is busy", updatedAt: "now", telemetry: null, lifecycle: { operation: "unload", status: "rejected", resourceState: "present", firstError: "unload is busy", cleanupError: null } }] };
  reconcileDeployment(record, new Map([["tuf", { generatedAtUnixMs: 123, nodes: [] } as unknown as P4AgentSnapshot]]), "2026-10-06T00:00:00Z");
  expect(record.reports[0]!.lifecycle!.status).toBe("rejected"); // Historical receipt remains intact.
  expect(record.status).not.toBe("unloaded"); // This status maps to the UI label "언로딩 완료".
  record.reports[0]!.loadOutcome = "unknown";
  expect(canStartDeployment(record)).toBe(false);
  record.reports[0]!.recovery = { kind: "forced", operationId: "00000000-0000-4000-8000-000000000001", observedAt: "2026-10-06T00:00:00Z" };
  expect(canStartDeployment(record)).toBe(true);
});
