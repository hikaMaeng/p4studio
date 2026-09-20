import { decodeLifecycleMetadata, parseLifecycleResult, NODE_LOAD_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE, sameEndpoint, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import type { DeploymentInput, DeploymentRecord, PlacementStage, StageReport } from "./index.js";
import { buildLoadPayload, LLAMA_TYPES, llamaPlanSummary } from "./payload.js";

export interface BrowserOwnedDeploymentTransport {
  exchange(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, terminalTypes: string[], timeoutMs: number): Promise<P4Event>;
  recover?(): void;
  close(): void;
}
export class UncertainP4Delivery extends Error {}
import { buildNodeLifecyclePayload, stageNeedsRecovery } from "./lifecycle.js";
import { checkBuilds } from "./compatibility.js";

/** Validation owned by the OUTER before it starts an irreversible P4 load. */
export function validateDeployment(plan: DeploymentInput): void {
  if (!plan.stages.length) throw new Error("Select at least one node");
  if (plan.nUbatch > plan.nBatch || !Number.isSafeInteger(plan.contextSize * plan.sequenceCapacity)) throw new Error("Invalid context or batch capacity");
  const identities = new Set<string>(), stageIds = new Set<string>(), endpoints = new Set<string>(); let end = 0;
  for (const stage of plan.stages) {
    if (!stage.agentId) throw new Error("Map every placement to a registered agent");
    const payload = buildLoadPayload(plan, stage, 1);
    const summary = plan.adapter === "llamacpp" && stage.planText !== undefined ? llamaPlanSummary(stage.planText) : stage;
    if (summary.layerStart !== stage.layerStart || summary.layerEnd !== stage.layerEnd || summary.artifact !== stage.artifact) throw new Error("Placement summary does not match the native plan");
    if (stage.layerStart !== end || stage.layerEnd <= stage.layerStart) throw new Error("Layer windows must cover the model in order without gaps or overlaps");
    end = stage.layerEnd; const key = JSON.stringify([stage.agentId, stage.nodeId]);
    if (identities.has(key)) throw new Error("A node cannot hold two placements in one model"); identities.add(key);
    if (stageIds.has(stage.id)) throw new Error("Placement IDs must be unique"); stageIds.add(stage.id);
    const endpoint = String(payload.endpoint ?? stage.endpoint);
    if (plan.adapter === "llamacpp" && (!stage.artifact.trim() || !String(payload.binary).trim() || !/^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[\da-fA-F:]+\]):\d+$/.test(endpoint))) throw new Error("Each llama.cpp node requires an agent-local model file, runtime binary and IP:port endpoint");
    if (plan.adapter === "llamacpp") {
      const port = Number(endpoint.slice(endpoint.lastIndexOf(":") + 1));
      if (port < 1 || port > 65535) throw new Error("Invalid runtime port");
      const localEndpoint = JSON.stringify([stage.agentId, endpoint]);
      if (endpoints.has(localEndpoint)) throw new Error("Runtime endpoints must be distinct on one agent"); endpoints.add(localEndpoint);
    }
    buildLoadPayload(plan, stage, 1);
  }
  if (end !== plan.totalLayers) throw new Error("Layer windows do not cover all model layers");
  if (plan.adapter !== "llamacpp") {
    const types = [plan.loadContentType, plan.loadedContentType, plan.unloadContentType, plan.unloadedContentType, plan.errorContentType];
    if (types.some(t => !/^application\/[\w.+-]+$/.test(t)) || new Set(types).size !== types.length) throw new Error("Specify the adapter's distinct load, loaded, unload, unloaded and error content types");
  }
}

/** Agent terminal results own readiness/removal; browser owns multi-stage recovery. */
export async function runBrowserDeployment(record: DeploymentRecord, action: "load" | "unload", addresses: Map<string, string>, wire: BrowserOwnedDeploymentTransport, persist: () => Promise<void>): Promise<void> {
  const types = record.adapter === "llamacpp" ? LLAMA_TYPES : record;
  let persistenceError = "";
  const save = async () => {
    record.updatedAt = new Date().toISOString();
    try { await persist(); } catch (error) { persistenceError ||= String(error); }
  };
  const operate = async (stage: PlacementStage, operation: "load" | "unload"): Promise<boolean> => {
    let report = record.reports.find(value => value.stageId === stage.id);
    if (!report) { report = { stageId: stage.id, state: "pending", detail: "", failureDetail: "", loadRequested: false, telemetry: null, updatedAt: "" }; record.reports.push(report); }
    let sent = false;
    try {
      const address = addresses.get(stage.agentId);
      if (!address) throw new Error("Placement agent no longer exists");
      const payload = buildNodeLifecyclePayload(record, stage, operation);
      report.state = operation === "load" ? "loading" : "unloading";
      report.detail = ""; report.updatedAt = new Date().toISOString();
      // Persist intent before issuing a command. A later receipt failure cannot skip cleanup.
      if (operation === "load") { report.loadRequested = true; report.loadOutcome = "unknown"; report.resourceState = "unknown"; }
      await save();
      if (operation === "load" && persistenceError) { report.loadRequested = false; report.resourceState = "absent"; throw new Error(persistenceError); }
      const target: P4Endpoint = { kind: "agent", address };
      sent = true;
      const reply = await wire.exchange(target, record.adapter, operation === "load" ? NODE_LOAD_CONTENT_TYPE : NODE_UNLOAD_CONTENT_TYPE,
        payload, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE], record.timeoutMs);
      if (!sameEndpoint(reply.source, target) || reply.adapterKind !== null) throw new UncertainP4Delivery("Lifecycle agent identity mismatch");
      if (reply.contentType !== NODE_LIFECYCLE_RESULT_CONTENT_TYPE) throw new UncertainP4Delivery("Agent returned no lifecycle resource result");
      const decoded = decodeLifecycleMetadata(reply.payload), metadata = parseLifecycleResult(decoded.metadata);
      if (metadata.node_id !== stage.nodeId || metadata.node_generation !== stage.nodeGeneration || metadata.adapter_kind !== record.adapter || metadata.operation !== operation) throw new UncertainP4Delivery("Lifecycle node, generation, operation or adapter mismatch");
      const expected = operation === "load" ? types.loadedContentType : types.unloadedContentType;
      const requestType = operation === "load" ? types.loadContentType : types.unloadContentType;
      if (metadata.status === "succeeded" ? metadata.adapter_content_type !== expected || metadata.resource_state !== (operation === "load" ? "present" : "absent")
        : ![types.errorContentType, requestType].includes(metadata.adapter_content_type)) throw new UncertainP4Delivery("Lifecycle completion type or resource state mismatch");
      let body: Record<string, unknown> | null = null;
      if (metadata.status === "succeeded") {
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded.opaque));
        if (!body || body.load_generation !== record.loadGeneration) throw new UncertainP4Delivery("Adapter load generation mismatch");
      }
      report.resourceState = metadata.resource_state;
      if (operation === "load") report.loadOutcome = metadata.status;
      report.lifecycle = { operation, status: metadata.status, resourceState: metadata.resource_state, firstError: metadata.first_error ?? null, cleanupError: metadata.cleanup_error ?? null };
      if (metadata.status !== "succeeded") {
        report.state = metadata.resource_state === "unknown" ? "unknown" : "failed";
        report.detail = metadata.first_error!;
        if (operation === "load") report.failureDetail ||= metadata.first_error!;
        report.cleanupError ||= metadata.cleanup_error ?? (operation === "unload" ? metadata.first_error! : "");
        if (operation === "unload" && metadata.resource_state === "absent" && report.loadOutcome === "unknown") {
          report.resourceState = "unknown"; report.state = "unknown";
        }
        // A rejected absent UNLOAD proves absence only; it is not a successful UNLOAD receipt.
        await save(); return false;
      }
      report.state = operation === "load" ? "ready" : "unloaded";
      if (operation === "load") report.telemetry = body;
      await save(); return true;
    } catch (error) {
      report.state = sent ? "unknown" : "failed";
      if (sent) report.resourceState = "unknown";
      report.detail = error instanceof Error ? error.message : String(error);
      if (operation === "load") { report.failureDetail ||= report.detail; if (!sent) report.loadOutcome = "failed"; }
      else report.cleanupError ||= report.detail;
      await save(); return false;
    }
  };
  let failed = false;
  try {
    if (action === "load") {
      for (const stage of record.stages) {
        if (!await operate(stage, "load")) { failed = true; record.error ||= record.reports.find(r => r.stageId === stage.id)?.failureDetail ?? "LOAD failed"; break; }
        if (persistenceError) { failed = true; record.error ||= persistenceError; break; }
      }
      if (!failed && record.adapter === "llamacpp") {
        try { checkBuilds(record.reports.map(report => report.telemetry as Record<string, unknown>), record.pipelineCompatibility); }
        catch (error) { failed = true; record.error = String(error); }
      }
      if (!failed) {
        record.status = "ready"; await save();
        if (persistenceError) { failed = true; record.error ||= persistenceError; }
      }
    }
    if (action === "unload" || failed) {
      // No LOAD replay. Recovery gets fresh OUTER connections after any timeout/disconnect.
      wire.recover?.();
      for (const stage of [...record.stages].reverse()) {
        const report = record.reports.find(value => value.stageId === stage.id);
        if (report && stageNeedsRecovery(report)) {
          if (!await operate(stage, "unload")) { failed = true; wire.recover?.(); }
        }
      }
    }
    const unresolved = record.reports.some(stageNeedsRecovery);
    record.status = unresolved ? (record.reports.some(r => r.state === "unknown") ? "unknown" : "failed")
      : action === "load" ? (failed ? "failed" : "ready") : "unloaded";
    // Ready stages are expected to own resources after a successful load.
    if (action === "load" && !failed && record.reports.length === record.stages.length && record.reports.every(r => r.state === "ready")) record.status = "ready";
    if (persistenceError) { record.error ||= persistenceError; if (record.status === "ready") record.status = "unknown"; }
  } finally { wire.close(); await save(); }
}
