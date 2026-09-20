import { deploymentRoutes, parseDeployment, parseDeploymentList, prepareDeploymentLoad, canStartDeployment, runBrowserDeployment, validateDeployment, type DeploymentRecord } from "@p4studio/studio_domain/common";
import { deployments, reconcileDeployment, type DeploymentGateway } from "@p4studio/studio_domain/front";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { inspectGraphAgent } from "../../p4/inspection.js";
import { agentAddress } from "@p4studio/studio_domain/common";
import { BrowserP4Reception, readAgentTopology } from "../../p4/reception.js";

async function request<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text(); const value: unknown = raw ? JSON.parse(raw) : undefined;
  if (!response.ok) {
    const detail = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(detail && typeof detail === "object" && "message" in detail ? String(detail.message) : String(response.status));
  }
  return value as T;
}
const gateway: DeploymentGateway = {
  list: async () => parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method)).deployments,
  save: async (input, id) => { const route = id ? deploymentRoutes.update : deploymentRoutes.create; return parseDeployment(await request(route.path.replace(":id", encodeURIComponent(id ?? "")), route.method, input)); },
  remove: async (id, discard) => { await request(`${deploymentRoutes.remove.path.replace(":id", encodeURIComponent(id))}${discard ? "?discard=true" : ""}`, deploymentRoutes.remove.method); },
  operate: async (id, action) => operateInBrowser(id, action),
  reconcile: async id => {
    const record = (await gateway.list()).find(value => value.id === id);
    if (!record) throw new Error("Model deployment was not found");
    const observations = new Map<string, P4AgentSnapshot | Error>();
    const agentIds = [...new Set(record.stages.map(stage => stage.agentId))];
    try {
      const topology = await readAgentTopology();
      // Sequential INSPECT bounds fan-out and shares one frozen topology.
      for (const id of agentIds) {
        try {
          const agent = topology.agents.find(value => value.id === id);
          if (!agent) throw new Error("Target agent is no longer registered");
          const savedAddress = record.resolvedAddresses[id];
          if (savedAddress && savedAddress !== agentAddress(agent)) throw new Error("Agent address changed since the recorded load");
          observations.set(id, await inspectGraphAgent(agent, topology));
        } catch (error) { observations.set(id, error instanceof Error ? error : new Error(String(error))); }
      }
    } catch (error) { for (const id of agentIds) observations.set(id, error instanceof Error ? error : new Error(String(error))); }
    reconcileDeployment(record, observations, new Date().toISOString());
    return parseDeployment(await request(deploymentRoutes.reconcile.path.replace(":id", encodeURIComponent(id)), deploymentRoutes.reconcile.method,
      { ...record, expectedUpdatedAt: record.updatedAt }));
  },
};

const receipt = (record: DeploymentRecord) => request(
  deploymentRoutes.receipt.path.replace(":id", encodeURIComponent(record.id)),
  deploymentRoutes.receipt.method,
  {
    status: record.status, loadGeneration: record.loadGeneration, operationId: record.operationId,
    error: record.error, reports: record.reports, resolvedAddresses: record.resolvedAddresses,
    stageGenerations: Object.fromEntries(record.stages.map(stage => [stage.id, stage.nodeGeneration])),
  },
).then(parseDeployment);

async function operateInBrowser(id: string, action: "load" | "unload"): Promise<DeploymentRecord> {
  const record = (await gateway.list()).find(value => value.id === id);
  if (!record) throw new Error("Model deployment was not found");
  if (action === "load") {
    if (!canStartDeployment(record)) throw new Error("Recover or inspect the previous operation before loading again");
    validateDeployment(record);
  } else if (!record.loadGeneration || ["draft", "unloaded"].includes(record.status)) throw new Error("No load operation to unload");
  const topology = await readAgentTopology();
  const addresses = action === "unload" ? new Map(Object.entries(record.resolvedAddresses)) : new Map(topology.agents.map(agent => [agent.id, agentAddress(agent)]));
  const connection = new BrowserP4Reception(topology, addresses);
  if (action === "load") prepareDeploymentLoad(record);
  record.operationId = connection.operationId;
  record.status = action === "load" ? "loading" : "unloading";
  record.error = "";
  if (action === "load") {
    record.resolvedAddresses = Object.fromEntries(addresses);
  }
  await receipt(record);
  try { await runBrowserDeployment(record, action, addresses, connection, async () => { await receipt(record); }); }
  catch (error) { record.status = "unknown"; record.error = error instanceof Error ? error.message : String(error); await receipt(record); }
  return record;
}
export const startModels = () => deployments.start(gateway);
