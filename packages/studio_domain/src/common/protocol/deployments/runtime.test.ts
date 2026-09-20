import { expect, it, vi } from "vitest";
import { decodeLifecycleMetadata, encodeLifecycleMetadata, parseLifecycleRequest, NODE_LOAD_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, type LifecycleResultMetadata, type P4Event } from "@p4studio/p4-protocol";
import { runBrowserDeployment, type BrowserOwnedDeploymentTransport } from "./runtime.js";
import { deploymentSchema, type DeploymentRecord } from "./index.js";
import { canAttemptInference, canStartDeployment, prepareDeploymentLoad } from "./lifecycle.js";
import { LLAMA_TYPES } from "./payload.js";

const model = (): DeploymentRecord => deploymentSchema.parse({
  id: "deployment", name: "test", adapter: "custom", ingressAgentId: "", totalLayers: 3, contextSize: 1, sequenceCapacity: 1, nBatch: 1, nUbatch: 1, timeoutMs: 100,
  loadContentType: "load", loadedContentType: "loaded", unloadContentType: "unload", unloadedContentType: "unloaded", errorContentType: "error",
  stages: [0, 1, 2].map(i => ({ id: `s${i}`, agentId: "agent", nodeId: `n${i}`, nodeGeneration: 7, artifact: "model.gguf", layerStart: i, layerEnd: i + 1, binary: "stage", endpoint: `127.0.0.1:${51000 + i}`, device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}" })),
  status: "loading", loadGeneration: 42, operationId: "operation", error: "", reports: [], resolvedAddresses: {}, createdAt: "now", updatedAt: "now",
});
const addresses = new Map([["agent", "tcp://127.0.0.1:51055"]]);

it("uses the current public llama.cpp lifecycle content types", () => {
  expect(LLAMA_TYPES).toMatchObject({
    loadContentType: "application/vnd.p4.llamacpp.load-v4+json",
    loadedContentType: "application/vnd.p4.llamacpp.loaded-v4+json",
    unloadContentType: "application/vnd.p4.llamacpp.unload-v3+json",
    unloadedContentType: "application/vnd.p4.llamacpp.unloaded-v3+json",
  });
});

it("permits only a SESSION-gated attempt after every unknown stage is freshly observed loaded", () => {
  const record = model(); record.status = "unknown";
  record.reports = record.stages.map(stage => ({ stageId: stage.id, state: "unknown" as const, detail: "", failureDetail: "", loadRequested: true,
    loadOutcome: "succeeded" as const, resourceState: "present" as const, updatedAt: "now", telemetry: null,
    observation: { state: "loaded" as const, checkedAt: "now", agentGeneratedAt: null, detail: "generation unavailable" } }));
  expect(canAttemptInference(record)).toBe(true);
  record.reports[0]!.observation!.state = "missing";
  expect(canAttemptInference(record)).toBe(false);
});

function transport(mutate?: (event: P4Event, metadata: LifecycleResultMetadata) => P4Event | void): BrowserOwnedDeploymentTransport & { calls: { action: string; node: string; capacities: unknown }[] } {
  const calls: { action: string; node: string; capacities: unknown }[] = [];
  return { calls, close: vi.fn(), recover: vi.fn(), exchange: async (target, adapter, contentType, payload) => {
    expect(target.kind).toBe("agent"); expect([NODE_LOAD_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE]).toContain(contentType);
    expect(payload).toBeInstanceOf(Uint8Array);
    const action = contentType === NODE_LOAD_CONTENT_TYPE ? "load" : "unload";
    const decoded = decodeLifecycleMetadata(payload as Uint8Array), request = parseLifecycleRequest(decoded.metadata, action);
    const command = JSON.parse(new TextDecoder().decode(decoded.opaque));
    calls.push({ action, node: request.node_id, capacities: request });
    const metadata: LifecycleResultMetadata = { schema: 1, node_id: request.node_id, node_generation: request.node_generation, adapter_kind: adapter,
      adapter_content_type: adapter === "llamacpp" ? (action === "load" ? LLAMA_TYPES.loadedContentType : LLAMA_TYPES.unloadedContentType) : action === "load" ? "loaded" : "unloaded",
      operation: action, status: "succeeded", resource_state: action === "load" ? "present" : "absent" };
    const event: P4Event = { eventId: "reply", correlationId: "operation", causationId: "request", source: target,
      target: { kind: "outer", address: target.address, channel: "test", generation: 1 }, returnRoute: null, class: 0, sequence: 1, deadline: null, adapterKind: null,
      contentType: NODE_LIFECYCLE_RESULT_CONTENT_TYPE, payload: new Uint8Array() };
    const changed = mutate?.(event, metadata);
    if (changed) return changed;
    event.payload = encodeLifecycleMetadata(metadata, new TextEncoder().encode(JSON.stringify({ load_generation: command.load_generation,
      upstream_commit: "pin", patch_set: "patch", backend_inventory: "CPU" })));
    return event;
  } };
}
const run = (record: DeploymentRecord, wire: BrowserOwnedDeploymentTransport, action: "load" | "unload" = "load") => runBrowserDeployment(record, action, addresses, wire, async () => {});
const reject = (metadata: LifecycleResultMetadata, resource: "absent" | "present" | "unknown" = "present") => Object.assign(metadata, { status: "rejected", resource_state: resource, adapter_content_type: metadata.operation, first_error: "busy or occupied" });

it("creates nodes with LOAD, confirms every stage, then removes them with UNLOAD", async () => {
  const record = model(), wire = transport();
  await run(record, wire); expect(record.status).toBe("ready"); expect(canStartDeployment(record)).toBe(false);
  expect(wire.calls[0]?.capacities).toMatchObject({ queue_capacity: 65536, retained_bytes: 268435456 });
  await run(record, wire, "unload"); expect(record.status).toBe("unloaded");
  expect(wire.calls.map(c => `${c.action}:${c.node}`)).toEqual(["load:n0", "load:n1", "load:n2", "unload:n2", "unload:n1", "unload:n0"]);
  expect(wire.calls[3]?.capacities).not.toHaveProperty("queue_capacity");
  expect(record.reports.every(r => r.lifecycle?.status === "succeeded" && r.resourceState === "absent")).toBe(true);
});
it("rolls back successful siblings after duplicate ID rejection without unloading the occupied ID", async () => {
  const record = model(), wire = transport((_event, metadata) => { if (metadata.operation === "load" && metadata.node_id === "n1") reject(metadata); });
  await run(record, wire);
  expect(wire.calls.map(c => `${c.action}:${c.node}`)).toEqual(["load:n0", "load:n1", "unload:n0"]);
  expect(record.status).toBe("failed"); expect(record.error).toContain("occupied");
  expect(record.reports[1]).toMatchObject({ loadOutcome: "rejected", resourceState: "present", failureDetail: "busy or occupied" });
  expect(canStartDeployment(record)).toBe(true);
});
it("recovers a failed load with residual resources and preserves first and cleanup errors", async () => {
  const record = model(), wire = transport((_event, metadata) => {
    if (metadata.node_id === "n1" && metadata.operation === "load") Object.assign(metadata, { status: "failed", resource_state: "unknown", adapter_content_type: "error", first_error: "native failed", cleanup_error: "child survived" });
    if (metadata.node_id === "n1" && metadata.operation === "unload") reject(metadata);
  });
  await run(record, wire); expect(record.status).toBe("failed");
  expect(record.reports[0]?.state).toBe("unloaded");
  expect(record.reports[1]).toMatchObject({ failureDetail: "native failed", cleanupError: "child survived", resourceState: "present" });
  expect(canStartDeployment(record)).toBe(false);
});
it("never promotes busy UNLOAD to removed and allows subsequent recovery", async () => {
  const record = model(); await run(record, transport());
  await run(record, transport((_event, metadata) => { if (metadata.node_id === "n1") reject(metadata); }), "unload");
  expect(record.status).toBe("failed"); expect(record.reports[1]?.state).toBe("failed");
  const retry = transport(); await run(record, retry, "unload");
  expect(retry.calls.map(c => c.node)).toEqual(["n1"]); expect(record.status).toBe("unloaded");
});
it.each(["node", "generation", "operation", "adapter", "resource", "contentType", "source", "loadGeneration", "truncated"])("keeps %s mismatch unknown until actual recovery", async mismatch => {
  const record = model(), wire = transport((event, metadata) => {
    if (metadata.operation === "unload") throw new Error("recovery disconnected");
    if (mismatch === "node") metadata.node_id = "wrong";
    if (mismatch === "generation") metadata.node_generation++;
    if (mismatch === "operation") metadata.operation = "unload";
    if (mismatch === "adapter") metadata.adapter_kind = "other";
    if (mismatch === "resource") metadata.resource_state = "absent";
    if (mismatch === "contentType") metadata.adapter_content_type = "wrong";
    if (mismatch === "source") event.source = { kind: "agent", address: "tcp://other:51055" };
    if (mismatch === "loadGeneration") { event.payload = encodeLifecycleMetadata(metadata, new TextEncoder().encode('{"load_generation":41}')); return event; }
    if (mismatch === "truncated") { event.payload = new Uint8Array([90, 0, 0, 0]); return event; }
  });
  await run(record, wire); expect(record.status).toBe("unknown"); expect(canStartDeployment(record)).toBe(false);
  expect(wire.calls.filter(c => c.action === "load")).toHaveLength(1);
  expect(record.reports[0]?.failureDetail).not.toBe("");
});
it("recovers a timed-out load without replaying LOAD and preserves the original failure", async () => {
  const record = model(), wire = transport((_event, metadata) => { if (metadata.operation === "load") throw new Error("bridge closed"); });
  await run(record, wire); expect(record.status).toBe("failed");
  expect(wire.calls.map(c => c.action)).toEqual(["load", "unload"]);
  expect(record.reports[0]).toMatchObject({ state: "unloaded", failureDetail: "bridge closed" });
});
it("does not erase uncertainty when a different connection observes absent before a delayed LOAD", async () => {
  const record = model(), wire = transport((_event, metadata) => { if (metadata.operation === "load") throw new Error("timeout"); reject(metadata, "absent"); });
  await run(record, wire); expect(record.status).toBe("unknown"); expect(canStartDeployment(record)).toBe(false);
});
it("rolls back all loaded stages after build incompatibility", async () => {
  const record = model(); record.adapter = "llamacpp";
  const wire = transport((event, metadata) => {
    if (metadata.node_id === "n1" && metadata.operation === "load") {
      event.payload = encodeLifecycleMetadata(metadata, new TextEncoder().encode('{"load_generation":42,"upstream_commit":"different","patch_set":"patch","backend_inventory":"CPU"}')); return event;
    }
  });
  await run(record, wire); expect(record.status).toBe("failed"); expect(record.error).toContain("agree");
  expect(wire.calls.filter(c => c.action === "unload")).toHaveLength(3);
});
it("recovers owned resources even if saving the loaded receipt fails", async () => {
  const record = model(), wire = transport();
  await runBrowserDeployment(record, "load", addresses, wire, async () => { if (record.reports[0]?.state === "ready") throw new Error("storage unavailable"); });
  expect(wire.calls.map(c => c.action)).toEqual(["load", "unload"]);
  expect(record.reports[0]?.resourceState).toBe("absent"); expect(record.error).toContain("storage unavailable");
});
it("does not issue LOAD when its intent cannot be persisted", async () => {
  const record = model(), wire = transport(); await runBrowserDeployment(record, "load", addresses, wire, async () => { throw new Error("offline storage"); });
  expect(wire.calls).toEqual([]); expect(record.status).toBe("failed");
});
it("keeps node IDs stable, advances generation, and blocks reuse while resources remain", async () => {
  const record = model(); record.status = "draft"; const ids = record.stages.map(s => s.nodeId);
  prepareDeploymentLoad(record, 1000); expect(record.stages.every(s => s.nodeGeneration === 1000)).toBe(true);
  await run(record, transport()); expect(() => prepareDeploymentLoad(record, 1001)).toThrow();
  await run(record, transport(), "unload"); prepareDeploymentLoad(record, 1001);
  expect(record.stages.map(s => s.nodeId)).toEqual(ids); expect(record.stages.every(s => s.nodeGeneration === 1001)).toBe(true);
});
