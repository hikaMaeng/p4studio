import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import type { DeploymentRecord, StageReport } from "../../../common/protocol/deployments/index.js";

/** See docs/api.md#model-refresh. INSPECT lacks llama.cpp load-generation identity. */
export function reconcileDeployment(record: DeploymentRecord, observations: Map<string, P4AgentSnapshot | Error>, checkedAt: string): void {
  record.reports = record.stages.map(stage => {
    const previous = record.reports.find(value => value.stageId === stage.id);
    const snapshot = observations.get(stage.agentId);
    const report: StageReport = { ...previous, stageId: stage.id, state: "unknown", detail: "", failureDetail: previous?.failureDetail ?? "",
      loadRequested: previous?.loadRequested ?? false, telemetry: previous?.telemetry ?? null, updatedAt: checkedAt,
      observation: { state: "unknown", checkedAt, agentGeneratedAt: snapshot && !(snapshot instanceof Error) ? snapshot.generatedAtUnixMs : null, detail: "" } };
    const observation = report.observation!;
    if (!snapshot || snapshot instanceof Error) {
      observation.detail = snapshot instanceof Error ? snapshot.message : "No agent observation";
    } else {
      const node = snapshot.nodes.find(value => value.nodeId === stage.nodeId);
      if (!node) {
        observation.state = "missing";
        if (previous?.loadOutcome === "unknown" && previous.resourceState !== "absent") observation.detail = "Node absent at inspection; the outstanding LOAD outcome is still unknown";
        else { report.state = "unloaded"; report.resourceState = "absent"; }
      }
      else if (node.generation !== stage.nodeGeneration || node.adapterKind !== record.adapter) {
        observation.detail = "Observed node generation or adapter differs from this deployment";
      } else if (node.lifecycleState !== undefined) {
        observation.state = node.lifecycleState;
        const result = node.lifecycleResult;
        if (result && (result.node_id !== stage.nodeId || result.node_generation !== stage.nodeGeneration || result.adapter_kind !== record.adapter)) {
          observation.state = "unknown"; observation.detail = "Inspection lifecycle result identity mismatch";
        } else {
          if (node.lifecycleState === "loaded" && result?.operation === "load" && result.status === "succeeded" && result.resource_state === "present") {
            // The node generation identifies this exact accepted LOAD.  Unlike
            // an adapter's legacy `loaded` string, the lifecycle terminal is a
            // supervised completion whose node identity is validated above.
            report.state = "ready"; report.loadOutcome = "succeeded"; report.resourceState = "present";
          }
          if (node.lifecycleState === "failed") { report.state = "failed"; observation.detail = result?.first_error ?? "Node lifecycle failed"; }
          if (result?.cleanup_error) report.cleanupError = result.cleanup_error;
          // Node presence, including adapter-empty/failed instances, still owns the ID.
          report.resourceState = result?.resource_state === "unknown" ? "unknown" : "present";
        }
      } else if (node.delivery?.stopped) {
        observation.state = "failed"; observation.detail = "Node execution has stopped"; report.state = "failed";
      } else if (record.adapter !== "llamacpp") {
        observation.detail = "No inspection state contract for this adapter";
      } else if (node.state === "empty" || node.state === "unloaded") {
        observation.detail = "Legacy empty adapter still has a node registration; removal is not confirmed";
      } else if (node.state === "loaded") {
        observation.state = "loaded";
        // Presence alone cannot associate a loaded model with the recorded LOAD.
      } else if (node.state === "loading" || node.state === "unloading") {
        observation.state = node.state;
      } else if (typeof node.state === "string" && node.state.startsWith("failed:")) {
        observation.state = "failed"; observation.detail = node.state; report.state = "failed";
      } else {
        observation.detail = typeof node.state === "string" ? node.state : "Unrecognized adapter inspection state";
      }
    }
    report.detail = observation.detail;
    return report;
  });
  record.status = record.reports.length && record.reports.every(value => value.state === "ready") ? "ready"
    : record.reports.length && record.reports.every(value => value.state === "unloaded") ? "unloaded"
      : record.reports.some(value => value.state === "unknown") || !record.reports.length ? "unknown" : "failed";
  if (record.status === "unloaded" && record.loadGeneration === 0) record.status = "draft";
  record.error = "";
}
