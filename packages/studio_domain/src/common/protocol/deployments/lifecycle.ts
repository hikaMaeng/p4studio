import { encodeLifecycleMetadata, parseLifecycleRequest, type LifecycleOperation } from "@p4studio/p4-protocol";
import type { DeploymentRecord, PlacementStage, StageReport } from "./index.js";
import { buildLoadPayload, LLAMA_TYPES } from "./payload.js";

// OUTER allocation policy, separate from opaque adapter resource_profile.
export const DEFAULT_NODE_ALLOCATION = { queueCapacity: 65536, completionCapacity: 65536, retainedCapacity: 65536, retainedBytes: 256 * 1024 * 1024 };
export function buildNodeLifecyclePayload(record: DeploymentRecord, stage: PlacementStage, action: LifecycleOperation): Uint8Array {
  const types = record.adapter === "llamacpp" ? LLAMA_TYPES : record;
  const allocation = stage.allocation ?? DEFAULT_NODE_ALLOCATION;
  const metadata = parseLifecycleRequest({ schema: 1, node_id: stage.nodeId, node_generation: stage.nodeGeneration,
    adapter_kind: record.adapter, adapter_content_type: action === "load" ? types.loadContentType : types.unloadContentType,
    ...(action === "load" ? { queue_capacity: allocation.queueCapacity, completion_capacity: allocation.completionCapacity,
      retained_capacity: allocation.retainedCapacity, retained_bytes: allocation.retainedBytes } : {}) }, action);
  return encodeLifecycleMetadata(metadata, new TextEncoder().encode(JSON.stringify(action === "load"
    ? buildLoadPayload(record, stage, record.loadGeneration) : { load_generation: record.loadGeneration })));
}
/** A rejected LOAD never transfers ownership of an already occupied ID. */
export function stageNeedsRecovery(report: StageReport): boolean {
  return (report.loadRequested || ["creating", "loading", "ready", "unloading", "unknown"].includes(report.state))
    && report.loadOutcome !== "rejected" && report.resourceState !== "absent" && report.state !== "unloaded";
}
export function canStartDeployment(record: DeploymentRecord): boolean {
  if (!record.reports.length && record.status === "unknown") return false;
  return ["draft", "unloaded", "failed", "unknown"].includes(record.status) && !record.reports.some(stageNeedsRecovery);
}
/**
 * An unknown deployment is never presented as ready.  It can, however, make a
 * SESSION-gated inference attempt after every stage was freshly observed as
 * loaded.  SESSION remains the generation-aware authority before PREFILL.
 */
export function canAttemptInference(record: DeploymentRecord): boolean {
  if (record.status === "ready") return true;
  return record.status === "unknown" && record.loadGeneration > 0 && record.reports.length === record.stages.length
    && record.reports.every(report => report.loadOutcome === "succeeded" && report.resourceState === "present" && report.observation?.state === "loaded");
}
/** Preserve IDs, advance generation only after the previous operation has no owned resources. */
export function prepareDeploymentLoad(record: DeploymentRecord, now = Date.now()): void {
  if (!canStartDeployment(record)) throw new Error("Recover or inspect the previous load before editing or loading again");
  const next = record.stages.map(stage => Math.max(stage.nodeGeneration, now, stage.nodeGeneration + (record.loadGeneration > 0 ? 1 : 0)));
  const loadGeneration = Math.max(now, record.loadGeneration + 1);
  if (!Number.isSafeInteger(loadGeneration) || next.some(value => !Number.isSafeInteger(value))) throw new Error("Deployment generation exhausted");
  record.stages.forEach((stage, index) => { stage.nodeGeneration = next[index]!; });
  record.loadGeneration = loadGeneration;
  record.reports = record.stages.map(stage => ({ stageId: stage.id, state: "pending", detail: "", failureDetail: "", loadRequested: false, telemetry: null, updatedAt: new Date(now).toISOString() }));
}
