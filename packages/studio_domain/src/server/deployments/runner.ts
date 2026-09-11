import { sameEndpoint, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import type { DeploymentRecord, StageReport } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, LLAMA_TYPES } from "./plan.js";
import { checkBuilds } from "./compatibility.js";

export interface DeploymentTransport {
  exchange(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, terminalTypes: string[], timeoutMs: number): Promise<P4Event>;
  close(): void;
}
export class UncertainDelivery extends Error {}
export async function runDeployment(
  record: DeploymentRecord, action: "load" | "unload", addresses: Map<string, string>,
  wire: DeploymentTransport, persist: () => void,
): Promise<void> {
  const types = record.adapter === "llamacpp" ? LLAMA_TYPES : record;
  const report = (id: string, state: StageReport["state"], detail = "", telemetry: unknown = null) => {
    const index = record.reports.findIndex(r => r.stageId === id);
    const previous = record.reports[index];
    const value = { stageId: id, state, detail, telemetry, loadRequested: state === "loading" || previous?.loadRequested === true,
      failureDetail: previous?.failureDetail || (["failed", "unknown"].includes(state) ? detail : ""), updatedAt: new Date().toISOString() } satisfies StageReport;
    if (index < 0) record.reports.push(value); else record.reports[index] = value;
    record.updatedAt = value.updatedAt; persist();
  };
  let failed = false;
  try {
    for (const stage of record.stages) {
      const previous = record.reports.find(r => r.stageId === stage.id);
      if (action === "unload" && (!previous || !previous.loadRequested || ["pending", "unloaded"].includes(previous.state))) {
        if (previous && previous.state !== "unloaded") report(stage.id, "unloaded", "No LOAD command was issued to this node");
        continue;
      }
      try {
        const address = addresses.get(stage.agentId);
        if (!address) throw new Error("Placement agent no longer exists");
        if (action === "load" && stage.createNode) {
          report(stage.id, "creating");
          const created = await wire.exchange({ kind: "agent", address }, record.adapter, "application/vnd.p4.node.create-v3+json",
            { node_id: stage.nodeId, node_generation: stage.nodeGeneration, adapter_kind: record.adapter },
            ["application/vnd.p4.node.result-v3+json"], record.timeoutMs);
          const body = JSON.parse(new TextDecoder().decode(created.payload));
          if (body.ok !== true || body.node_id !== stage.nodeId) throw new Error(body.detail || "Node creation was not confirmed");
          // Creation materialises an empty adapter; it is not model readiness.
          stage.createNode = false; persist();
        }
        report(stage.id, action === "load" ? "loading" : "unloading");
        const target: P4Endpoint = { kind: "node", address, nodeId: stage.nodeId, generation: stage.nodeGeneration };
        const expected = action === "load" ? types.loadedContentType : types.unloadedContentType;
        const reply = await wire.exchange(target, record.adapter, action === "load" ? types.loadContentType : types.unloadContentType,
          action === "load" ? buildLoadPayload(record, stage, record.loadGeneration) : { load_generation: record.loadGeneration },
          [expected, types.errorContentType, "application/vnd.p4.node.result-v3+json"], record.timeoutMs);
        const body = JSON.parse(new TextDecoder().decode(reply.payload));
        if (reply.contentType !== expected) throw new Error(body.detail || body.error || body.message || JSON.stringify(body));
        if (!sameEndpoint(reply.source, target) || body.load_generation !== record.loadGeneration) throw new UncertainDelivery("Completion identity or load generation mismatch");
        report(stage.id, action === "load" ? "ready" : "unloaded", "", body);
      } catch (error) {
        failed = true;
        report(stage.id, error instanceof UncertainDelivery ? "unknown" : "failed", error instanceof Error ? error.message : String(error));
        // Preserve confirmed siblings. Continue cleanup, but stop starting new loads after failure.
        if (action === "load") break;
      }
    }
    if (!failed && action === "load" && record.adapter === "llamacpp") {
      const identities = record.reports.map(r => r.telemetry as Record<string, unknown>);
      try { checkBuilds(identities, record.pipelineCompatibility); }
      catch (e) { failed = true; record.error = String(e); }
    }
    record.status = failed ? (record.reports.some(r => r.state === "unknown") ? "unknown" : "failed") : action === "load" ? "ready" : "unloaded";
  } finally { wire.close(); record.updatedAt = new Date().toISOString(); persist(); }
}
