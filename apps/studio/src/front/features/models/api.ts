import { deploymentRoutes, parseDeployment, parseDeploymentList, prepareDeploymentLoad, canStartDeployment, runBrowserDeployment, validateDeploymentLoad, type DeploymentRecord } from "@p4studio/studio_domain/common";
import { deployments, reconcileDeployment, inferenceExecutions, type DeploymentGateway } from "@p4studio/studio_domain/front";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { inspectGraphAgent } from "../../p4/inspection.js";
import { agentAddress } from "@p4studio/studio_domain/common";
import { BrowserP4Reception, readAgentTopology } from "../../p4/reception.js";

async function request<T = unknown>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(signal ? { signal } : {}), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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

const receipt = async (record: DeploymentRecord, expectedUpdatedAt = record.updatedAt, signal?: AbortSignal) => {
  const saved = parseDeployment(await request(
  deploymentRoutes.receipt.path.replace(":id", encodeURIComponent(record.id)),
  deploymentRoutes.receipt.method,
  {
    expectedUpdatedAt,
    status: record.status, loadGeneration: record.loadGeneration, operationId: record.operationId,
    error: record.error, reports: record.reports, sessionProof: record.sessionProof, resolvedAddresses: record.resolvedAddresses,
    stageGenerations: Object.fromEntries(record.stages.map(stage => [stage.id, stage.nodeGeneration])),
  },
  signal,
  ));
  record.updatedAt = saved.updatedAt;
  return saved;
};

export async function recordSessionProof(modelId: string, sessionId: string, checkedAt: string, loadGeneration: number, stageGenerations: Record<string, number>): Promise<void> {
  const signal = AbortSignal.timeout(30_000);
  const record = parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method, undefined, signal)).deployments.find(value => value.id === modelId);
  const freshlyObserved = record?.status === "unknown" && record.reports.every(report => report.observation?.state === "loaded");
  if (!record || record.loadGeneration !== loadGeneration || record.stages.length !== record.reports.length
    || !(["loaded", "ready"].includes(record.status) || freshlyObserved)
    || record.stages.some(stage => stageGenerations[stage.id] !== stage.nodeGeneration)
    || record.reports.some(report => report.loadOutcome !== "succeeded" || report.resourceState !== "present")) {
    throw new Error("P4 SESSION_READY cannot prove a model whose current LOAD receipts are incomplete");
  }
  record.sessionProof = { sessionId, loadGeneration: record.loadGeneration, stageIds: record.stages.map(stage => stage.id), checkedAt };
  record.status = "ready";
  record.error = "";
  record.reports.forEach(report => { report.state = "ready"; report.updatedAt = checkedAt; });
  await receipt(record, record.updatedAt, signal);
}

async function operateInBrowser(id: string, action: "load" | "unload"): Promise<DeploymentRecord> {
  const record = (await gateway.list()).find(value => value.id === id);
  if (!record) throw new Error("Model deployment was not found");
  if (action === "load") {
    if (!canStartDeployment(record)) throw new Error("Recover or inspect the previous operation before loading again");
    validateDeploymentLoad(record);
  } else if (!record.loadGeneration || ["draft", "unloaded"].includes(record.status)) throw new Error("No load operation to unload");
  return action === "unload" ? inferenceExecutions.unload(record, async () => {
    const current = (await gateway.list()).find(value => value.id === record.id);
    if (!current || current.loadGeneration !== record.loadGeneration || current.stages.length !== record.stages.length
      || record.stages.some(stage => !current.stages.some(value => value.id === stage.id && value.agentId === stage.agentId && value.nodeId === stage.nodeId && value.nodeGeneration === stage.nodeGeneration))) throw new Error("Model placement changed while stopping inference; inspect before unloading");
    return operatePrepared(current, action);
  }) : operatePrepared(record, action);
}

async function operatePrepared(record: DeploymentRecord, action: "load" | "unload"): Promise<DeploymentRecord> {
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
  let serverRevision = record.updatedAt;
  try { await runBrowserDeployment(record, action, addresses, connection, async () => {
    const saved = await receipt(record, serverRevision);
    serverRevision = saved.updatedAt;
  }); }
  catch (error) { record.status = "unknown"; record.error = error instanceof Error ? error.message : String(error); await receipt(record, serverRevision); }
  return record;
}
let restartReconciliation: Promise<void> | undefined;
export const startModels = () => {
  deployments.start(gateway);
  restartReconciliation ??= gateway.list().then(async records => {
    for (const record of records.filter(value => value.status === "unknown" && value.loadGeneration > 0 && value.reports.some(report => !report.observation))) {
      await deployments.reconcile(record.id);
    }
  }).catch(() => { /* The normal deployment refresh reports API errors; P4 reconciliation is best-effort. */ });
};
