import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";
import type { StageRequestWork } from "../../../common/protocol/model-requests/index.js";

// Adapter diagnostics are observations, never cancellation or native-stop authority.
function llamaWork(state: unknown): Record<string, unknown> | null {
  if (typeof state !== "string") return null;
  const start = state.lastIndexOf("work={"); if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start + 5; i < state.length; i++) {
    const char = state[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try { const value: unknown = JSON.parse(state.slice(start + 5, i + 1)); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
    }
  }
  return null;
}
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function observeModelRequests(record: DeploymentRecord, observations: Map<string, P4AgentSnapshot | Error>, observedAt: string): StageRequestWork[] {
  return record.stages.map(stage => {
    const item: StageRequestWork = { stageId: stage.id, nodeId: stage.nodeId, observedAt, state: "unknown", requests: null, pending: null, activeOwners: null, flights: null, detail: "" };
    const snapshot = observations.get(stage.agentId);
    if (!snapshot || snapshot instanceof Error) { item.detail = snapshot instanceof Error ? snapshot.message : "No P4 observation"; return item; }
    item.observedAt = new Date(snapshot.generatedAtUnixMs).toISOString();
    if (Math.abs(Date.now() - snapshot.generatedAtUnixMs) > 30_000) { item.detail = "P4 request observation is stale"; return item; }
    const node = snapshot.nodes.find(node => node.nodeId === stage.nodeId);
    if (!node) return { ...item, state: "absent", requests: 0, pending: 0, activeOwners: 0, flights: 0 };
    if (node.generation !== stage.nodeGeneration || node.loadGeneration !== record.loadGeneration || node.adapterKind !== record.adapter) { item.detail = "Observed node/load identity differs from this model"; return item; }
    const work = record.adapter === "llamacpp" ? llamaWork(node.state) : null;
    if (!work) { item.detail = "Adapter did not provide request counters"; return item; }
    return { ...item, state: "observed", requests: count(work.requests), pending: count(work.pending), activeOwners: count(work.active_owners), flights: count(work.flight_batches) };
  });
}
