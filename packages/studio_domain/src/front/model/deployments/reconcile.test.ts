import { expect, it } from "vitest";
import type { P4AgentSnapshot, P4RegisteredNodeSnapshot } from "@p4studio/p4-protocol";
import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";
import { emptyDeployment, emptyStage } from "./store.js";
import { reconcileDeployment, hasObservedNoNodes } from "./reconcile.js";
import { canStartDeployment, canStartLoad } from "../../../common/protocol/deployments/lifecycle.js";

const checkedAt = "2026-09-15T00:00:00.000Z";
const model = (): DeploymentRecord => ({ ...emptyDeployment(), id: "model", name: "model", status: "loaded", loadGeneration: 42, operationId: "load-42", error: "restart", sessionProof: null,
  resolvedAddresses: {}, createdAt: checkedAt, updatedAt: checkedAt,
  stages: ["a", "b"].map(id => ({ ...emptyStage(), id, agentId: id, nodeId: id, nodeGeneration: 2 })),
  reports: ["a", "b"].map(stageId => ({ stageId, state: "ready", loadRequested: true, detail: "", failureDetail: "old error", telemetry: { load_generation: 42 }, updatedAt: checkedAt })) });
const snapshot = (id: string, state: unknown, changes: Partial<P4RegisteredNodeSnapshot> = {}): P4AgentSnapshot => ({ generatedAtUnixMs: 123,
  nodes: [{ nodeId: id, generation: 2, adapterKind: "llamacpp", state, delivery: null, ...changes }] } as P4AgentSnapshot);

it("does not promote loaded presence to generation-verified readiness and preserves LOAD evidence", () => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('a', 'loaded')], ['b', snapshot('b', 'loaded')]]), checkedAt);
  expect(record.status).toBe("unknown");
  expect(record.reports[0]).toMatchObject({ state: "unknown", loadRequested: true, telemetry: { load_generation: 42 }, failureDetail: "old error", observation: { state: "loaded", checkedAt, agentGeneratedAt: 123 } });
  expect(record.operationId).toBe("load-42"); expect(record.error).toBe("restart");
});
it("recognizes absence but never treats an empty adapter as node removal", () => {
  const record = model(), absent = snapshot('other', 'loaded');
  reconcileDeployment(record, new Map([['a', absent], ['b', snapshot('b', 'empty')]]), checkedAt);
  expect(record.status).toBe("unknown");
  expect(record.reports.map(value => value.observation?.state)).toEqual(["missing", "unknown"]);
});
it("preserves partial results and treats unreachable agents as unknown", () => {
  const record = model();
  reconcileDeployment(record, new Map<string, P4AgentSnapshot | Error>([['a', snapshot('other', 'loaded')], ['b', new Error('timeout')]]), checkedAt);
  expect(record.status).toBe("unknown");
  expect(record.reports.map(value => value.state)).toEqual(["absent", "unknown"]);
  expect(record.reports[1]?.observation).toMatchObject({ agentGeneratedAt: null, detail: "timeout" });
});
it.each([{ generation: 3 }, { adapterKind: "custom" }])("rejects another node identity: %j", changes => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('a', 'empty', changes)], ['b', snapshot('b', 'empty')]]), checkedAt);
  expect(record.status).toBe("unknown"); expect(record.reports[0]?.state).toBe("unknown");
});
it.each(["loading", "unloading", "poisoned", { lifecycle: "ready" }])("leaves unsupported or transitioning state uncertain: %j", state => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('a', state)], ['b', snapshot('b', 'empty')]]), checkedAt);
  expect(record.status).toBe("unknown");
});
it("reports confirmed worker failure without claiming memory was released", () => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('a', 'loaded', { delivery: { stopped: true, inputRetained: 0, completionRetained: 0 } })], ['b', snapshot('b', 'failed:engine')]]), checkedAt);
  expect(record.status).toBe("failed"); expect(record.reports.every(value => value.state === "failed")).toBe(true);
});
it("accepts a supervised LOAD terminal as loaded evidence without a SESSION proof", () => {
  const record = model();
  const result = { schema: 1, node_id: "a", node_generation: 2, adapter_kind: "llamacpp", adapter_content_type: "loaded", operation: "load", status: "succeeded", resource_state: "present", first_error: null, cleanup_error: null } as const;
  reconcileDeployment(record, new Map([['a', snapshot('a', 'loaded', { lifecycleState: 'loaded', lifecycleResult: result })], ['b', snapshot('b', 'loaded', { lifecycleState: 'loaded', lifecycleResult: { ...result, node_id: "b" } })]]), checkedAt);
  expect(record.status).toBe("loaded");
  expect(record.reports[0]).toMatchObject({ state: "loaded", loadOutcome: "succeeded", resourceState: "present", observation: { state: "loaded" } });
});
it("promotes matching LOAD terminals only when every stage has the current SESSION proof", () => {
  const record = model();
  record.sessionProof = { sessionId: "session-42", loadGeneration: 42, stageIds: ["a", "b"], checkedAt: checkedAt };
  const result = { schema: 1, node_id: "a", node_generation: 2, adapter_kind: "llamacpp", adapter_content_type: "loaded", operation: "load", status: "succeeded", resource_state: "present", first_error: null, cleanup_error: null } as const;
  reconcileDeployment(record, new Map([['a', snapshot('a', 'loaded', { lifecycleState: 'loaded', lifecycleResult: result })], ['b', snapshot('b', 'loaded', { lifecycleState: 'loaded', lifecycleResult: { ...result, node_id: "b" } })]]), checkedAt);
  expect(record.status).toBe("ready");
  expect(record.reports.every(report => report.state === "ready")).toBe(true);
});
it("reads neutral lifecycle state before adapter snapshots and preserves cleanup failure", () => {
  const record = model();
  const result = { schema: 1, node_id: "a", node_generation: 2, adapter_kind: "llamacpp", adapter_content_type: "error", operation: "load", status: "failed", resource_state: "unknown", first_error: "native failed", cleanup_error: "child survived" } as const;
  reconcileDeployment(record, new Map([['a', snapshot('a', 'empty', { lifecycleState: 'failed', lifecycleResult: result })], ['b', snapshot('other', 'loaded')]]), checkedAt);
  expect(record.status).toBe("failed");
  expect(record.reports[0]).toMatchObject({ state: "failed", resourceState: "unknown", cleanupError: "child survived", observation: { state: "failed" } });
});
it("allows a new load generation after fresh node absence while preserving old LOAD uncertainty", () => {
  const record = model(); record.reports[0]!.loadOutcome = "unknown"; record.reports[0]!.resourceState = "unknown";
  reconcileDeployment(record, new Map([['a', snapshot('other', 'loaded')], ['b', snapshot('other', 'loaded')]]), checkedAt);
  expect(record.status).toBe("absent"); expect(record.reports[0]).toMatchObject({ state: "absent", resourceState: "absent" });
  expect(hasObservedNoNodes(record)).toBe(true);
  expect(record.reports[0]?.loadOutcome).toBe("unknown");
  expect(canStartLoad(record)).toBe(true);
  // The old command history still makes editing/deleting its plan unsafe.
  expect(canStartDeployment(record)).toBe(false);
});
it("uses the displayed missing-node observation for LOAD eligibility without unlocking plan edits", () => {
  const record = model(); record.status = "unknown";
  record.reports = record.stages.map(stage => ({ stageId: stage.id, state: "unknown", detail: "", failureDetail: "", loadRequested: true,
    loadOutcome: "unknown", resourceState: "unknown", updatedAt: checkedAt, telemetry: null,
    observation: { state: "missing", checkedAt, agentGeneratedAt: 123, detail: "" } }));
  expect(hasObservedNoNodes(record)).toBe(true);
  expect(canStartLoad(record)).toBe(true);
  expect(canStartDeployment(record)).toBe(false);
  record.reports[0]!.updatedAt = "2026-09-15T00:01:00.000Z";
  expect(hasObservedNoNodes(record)).toBe(false);
  expect(canStartLoad(record)).toBe(false);
});
it("does not display complete absence when an agent is unreachable or a stage still exists", () => {
  const record = model();
  reconcileDeployment(record, new Map<string, P4AgentSnapshot | Error>([['a', snapshot('other', 'loaded')], ['b', new Error('unreachable')]]), checkedAt);
  expect(hasObservedNoNodes(record)).toBe(false);
  reconcileDeployment(record, new Map([['a', snapshot('other', 'loaded')], ['b', snapshot('b', 'loaded')]]), checkedAt);
  expect(hasObservedNoNodes(record)).toBe(false);
});
it("requires exactly one current observation for each planned stage", () => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('other', 'loaded')], ['b', snapshot('other', 'loaded')]]), checkedAt);
  expect(hasObservedNoNodes(record)).toBe(true);
  record.reports[1]!.stageId = 'a';
  expect(hasObservedNoNodes(record)).toBe(false);
  record.stages = [];
  expect(hasObservedNoNodes(record)).toBe(false);
});
it("does not use an old absence snapshot after a newer unknown operation", () => {
  const record = model(); record.reports[0]!.loadOutcome = "unknown";
  reconcileDeployment(record, new Map([['a', snapshot('other', 'loaded')], ['b', snapshot('other', 'loaded')]]), checkedAt);
  expect(hasObservedNoNodes(record)).toBe(true);
  record.reports[0]!.updatedAt = "2026-09-15T00:01:00.000Z";
  expect(hasObservedNoNodes(record)).toBe(false);
});
it.each(["loading", "unloading", "loaded", "ready"] as const)("does not present a %s model as absent based on older observations", status => {
  const record = model();
  reconcileDeployment(record, new Map([['a', snapshot('other', 'loaded')], ['b', snapshot('other', 'loaded')]]), checkedAt);
  record.status = status;
  expect(hasObservedNoNodes(record)).toBe(false);
});
