import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import type { DeploymentRecord, StageReport } from "../../../common/protocol/deployments/index.js";
import { stageHasCurrentAbsenceObservation } from "../../../common/protocol/deployments/lifecycle.js";

/** Current observation for display only; it never retires an unknown LOAD. See docs/api.md#model-refresh. */
export function hasObservedNoNodes(record: DeploymentRecord): boolean {
  if (!record.stages.length || ["loading", "unloading", "loaded", "ready"].includes(record.status)
    || record.reports.length !== record.stages.length) return false;
  return record.stages.every(stage => {
    const reports = record.reports.filter(report => report.stageId === stage.id);
    if (reports.length !== 1) return false;
    const report = reports[0]!;
    return stageHasCurrentAbsenceObservation(report);
  });
}

/** See docs/api.md#model-refresh. Current agents report the held load generation; older ones report none. */
export function reconcileDeployment(record: DeploymentRecord, observations: Map<string, P4AgentSnapshot | Error>, checkedAt: string): void {
  const proof = record.sessionProof;
  const proofMatches = !!proof && proof.loadGeneration === record.loadGeneration
    && proof.stageIds.length === record.stages.length
    && record.stages.every(stage => proof.stageIds.includes(stage.id));
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
        // This snapshot answers current registry presence. Preserve an unknown
        // older LOAD result as history without claiming a node is still owned.
        report.state = previous?.lifecycle?.operation === "unload" && previous.lifecycle.status === "succeeded" && previous.lifecycle.resourceState === "absent" ? "unloaded" : "absent";
        report.resourceState = "absent";
        if (previous?.loadOutcome === "unknown") observation.detail = "Node is absent now; the previous LOAD outcome remains unknown in history";
      }
      else if (node.generation !== stage.nodeGeneration || node.adapterKind !== record.adapter) {
        observation.detail = "Observed node generation or adapter differs from this deployment";
      } else if (typeof node.loadGeneration === "number" && record.loadGeneration > 0 && node.loadGeneration !== record.loadGeneration) {
        // Same node identity, another LOAD: nothing recorded here describes what the node holds now.
        observation.detail = "Observed load generation differs from this deployment's recorded LOAD";
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
            report.state = proofMatches ? "ready" : "loaded"; report.loadOutcome = "succeeded"; report.resourceState = "present";
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
  record.status = record.reports.length && record.reports.every(value => value.state === "ready") && proofMatches ? "ready"
    : record.reports.length && record.reports.every(value => value.state === "loaded") ? "loaded"
    : record.reports.length && record.reports.every(value => value.state === "unloaded") ? "unloaded"
    : record.reports.length && record.reports.every(value => value.resourceState === "absent") ? "absent"
      : record.reports.some(value => value.state === "unknown") || !record.reports.length ? "unknown" : "failed";
  if (["unloaded", "absent"].includes(record.status) && record.loadGeneration === 0) record.status = "draft";
  if (!["absent", "failed", "unknown"].includes(record.status)) record.error = "";
}
