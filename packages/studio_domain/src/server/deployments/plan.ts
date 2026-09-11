import type { DeploymentInput } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, llamaPlanSummary } from "../../common/protocol/deployments/payload.js";
export { buildLoadPayload, quotePlan, LLAMA_TYPES } from "../../common/protocol/deployments/payload.js";

export function validatePlacement(plan: DeploymentInput): void {
  if (!plan.ingressAgentId || !plan.stages.length) throw new Error("Select an ingress agent and at least one node");
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
