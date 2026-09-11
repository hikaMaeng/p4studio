import { sameEndpoint, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import type { DeploymentInput, DeploymentRecord, StageReport } from "./index.js";
import { buildLoadPayload, LLAMA_TYPES, llamaPlanSummary } from "./payload.js";

export interface BrowserOwnedDeploymentTransport {
  exchange(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, terminalTypes: string[], timeoutMs: number): Promise<P4Event>;
  close(): void;
}
export class UncertainP4Delivery extends Error {}

/** Validation owned by the OUTER before it starts an irreversible P4 load. */
export function validateDeployment(plan: DeploymentInput): void {
  if (!plan.ingressAgentId || !plan.stages.length) throw new Error("Select an ingress agent and at least one node");
  if (plan.nUbatch > plan.nBatch || !Number.isSafeInteger(plan.contextSize * plan.sequenceCapacity)) throw new Error("Invalid context or batch capacity");
  const identities = new Set<string>(), stageIds = new Set<string>(); let end = 0;
  for (const stage of plan.stages) {
    if (!stage.agentId) throw new Error("Map every placement to a registered agent");
    const payload = buildLoadPayload(plan, stage, 1);
    const summary = plan.adapter === "llamacpp" && stage.planText !== undefined ? llamaPlanSummary(stage.planText) : stage;
    if (summary.layerStart !== stage.layerStart || summary.layerEnd !== stage.layerEnd || summary.artifact !== stage.artifact) throw new Error("Placement summary does not match the native plan");
    if (stage.layerStart !== end || stage.layerEnd <= stage.layerStart) throw new Error("Layer windows must cover the model in order without gaps or overlaps");
    end = stage.layerEnd;
    const identity = JSON.stringify([stage.agentId, stage.nodeId]);
    if (identities.has(identity)) throw new Error("A node cannot hold two placements in one model"); identities.add(identity);
    if (stageIds.has(stage.id)) throw new Error("Placement IDs must be unique"); stageIds.add(stage.id);
    if (plan.adapter === "llamacpp" && (!stage.artifact.trim() || !String(payload.binary).trim() || !/^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[\da-fA-F:]+\]):\d+$/.test(String(payload.endpoint ?? stage.endpoint)))) throw new Error("Each llama.cpp node requires an agent-local model file, runtime binary and IP:port endpoint");
  }
  if (end !== plan.totalLayers) throw new Error("Layer windows do not cover all model layers");
}

export async function runBrowserDeployment(record: DeploymentRecord, action: "load" | "unload", addresses: Map<string, string>, wire: BrowserOwnedDeploymentTransport, persist: () => Promise<void>): Promise<void> {
  const types = record.adapter === "llamacpp" ? LLAMA_TYPES : record;
  const report = async (id: string, state: StageReport["state"], detail = "", telemetry: unknown = null) => {
    const index = record.reports.findIndex(item => item.stageId === id), previous = record.reports[index];
    const value = { stageId: id, state, detail, telemetry, loadRequested: state === "loading" || previous?.loadRequested === true,
      failureDetail: previous?.failureDetail || (["failed", "unknown"].includes(state) ? detail : ""), updatedAt: new Date().toISOString() } satisfies StageReport;
    if (index < 0) record.reports.push(value); else record.reports[index] = value;
    record.updatedAt = value.updatedAt; await persist();
  };
  let failed = false;
  try {
    for (const stage of record.stages) {
      const previous = record.reports.find(item => item.stageId === stage.id);
      if (action === "unload" && (!previous || !previous.loadRequested || ["pending", "unloaded"].includes(previous.state))) {
        if (previous && previous.state !== "unloaded") await report(stage.id, "unloaded", "No LOAD command was issued to this node");
        continue;
      }
      try {
        const address = addresses.get(stage.agentId); if (!address) throw new Error("Placement agent no longer exists");
        if (action === "load" && stage.createNode) {
          await report(stage.id, "creating");
          const created = await wire.exchange({ kind: "agent", address }, record.adapter, "application/vnd.p4.node.create-v3+json", { node_id: stage.nodeId, node_generation: stage.nodeGeneration, adapter_kind: record.adapter }, ["application/vnd.p4.node.result-v3+json"], record.timeoutMs);
          const body = JSON.parse(new TextDecoder().decode(created.payload));
          if (body.ok !== true || body.node_id !== stage.nodeId) throw new Error(body.detail || "Node creation was not confirmed");
          stage.createNode = false; await persist();
        }
        await report(stage.id, action === "load" ? "loading" : "unloading");
        const target: P4Endpoint = { kind: "node", address, nodeId: stage.nodeId, generation: stage.nodeGeneration };
        const expected = action === "load" ? types.loadedContentType : types.unloadedContentType;
        const reply = await wire.exchange(target, record.adapter, action === "load" ? types.loadContentType : types.unloadContentType, action === "load" ? buildLoadPayload(record, stage, record.loadGeneration) : { load_generation: record.loadGeneration }, [expected, types.errorContentType, "application/vnd.p4.node.result-v3+json"], record.timeoutMs);
        const body = JSON.parse(new TextDecoder().decode(reply.payload));
        if (reply.contentType !== expected) throw new Error(body.detail || body.error || body.message || JSON.stringify(body));
        if (!sameEndpoint(reply.source, target) || body.load_generation !== record.loadGeneration) throw new UncertainP4Delivery("Completion identity or load generation mismatch");
        await report(stage.id, action === "load" ? "ready" : "unloaded", "", body);
      } catch (error) {
        const uncertain = error instanceof UncertainP4Delivery || (error instanceof Error && error.name === "UncertainP4Delivery");
        failed = true; await report(stage.id, uncertain ? "unknown" : "failed", error instanceof Error ? error.message : String(error));
        if (action === "load") break;
      }
    }
    record.status = failed ? (record.reports.some(item => item.state === "unknown") ? "unknown" : "failed") : action === "load" ? "ready" : "unloaded";
  } finally { wire.close(); record.updatedAt = new Date().toISOString(); await persist(); }
}
