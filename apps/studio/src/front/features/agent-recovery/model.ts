import { startRecovery } from "@p4studio/studio_domain/front";
import { recoveryListSchema, recoveryOperationSchema } from "../../../common/recovery.js";
import { readAgentTopology } from "../../p4/reception.js";
import { inspectGraphAgent } from "../../p4/inspection.js";
export { recoveryFor } from "@p4studio/studio_domain/front";
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/agent-recovery/${path}`, { method, signal: AbortSignal.timeout(100_000), headers: { "Content-Type": "application/json", "X-P4Studio-Action": "recovery" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`); return result;
}
startRecovery({
  list: async agentId => recoveryListSchema.parse(await request(`agents/${encodeURIComponent(agentId)}`)),
  plan: async agentId => recoveryOperationSchema.parse(await request(`agents/${encodeURIComponent(agentId)}/plan`, "POST", { operationId: crypto.randomUUID() })),
  execute: operation => request(`operations/${operation.id}/execute`, "POST", { confirm: operation.id }),
  resume: operation => request(`operations/${operation.id}/resume`, "POST", { confirm: operation.id }),
  reprobe: operation => request(`operations/${operation.id}/reprobe`, "POST"),
  cancel: operation => request(`operations/${operation.id}/cancel`, "POST"),
  reviewRetry: operation => request(`operations/${operation.id}/review-retry`, "POST"),
  retry: operation => request(`operations/${operation.id}/retry`, "POST", { confirm: operation.id, attemptId: operation.retry?.id }),
  verify: async operation => {
    const topology = await readAgentTopology(), agent = topology.agents.find(value => value.id === operation.agentId);
    if (!agent || !operation.after) throw new Error("Fresh agent host proof is unavailable");
    const snapshot = await inspectGraphAgent(agent, topology);
    return request(`operations/${operation.id}/verify`, "POST", { observedAt: new Date().toISOString(), agentPid: operation.after.agentPid, agentBorn: operation.after.agentBorn, nodes: snapshot.nodes.length });
  },
});
