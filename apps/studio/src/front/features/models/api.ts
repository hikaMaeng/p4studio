import { deploymentRoutes, parseDeployment, parseDeploymentList, runBrowserDeployment, validateDeployment, type DeploymentRecord } from "@p4studio/studio_domain/common";
import { deployments, type DeploymentGateway } from "@p4studio/studio_domain/front";
import { BrowserP4Connection } from "../../p4/connection.js";

async function request<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value: unknown = await response.json();
  if (!response.ok) {
    const detail = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(detail && typeof detail === "object" && "message" in detail ? String(detail.message) : String(response.status));
  }
  return value as T;
}
const gateway: DeploymentGateway = {
  list: async () => parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method)).deployments,
  save: async (input, id) => { const route = id ? deploymentRoutes.update : deploymentRoutes.create; return parseDeployment(await request(route.path.replace(":id", encodeURIComponent(id ?? "")), route.method, input)); },
  operate: async (id, action) => operateInBrowser(id, action),
};

const receipt = (record: DeploymentRecord) => request(
  deploymentRoutes.receipt.path.replace(":id", encodeURIComponent(record.id)),
  deploymentRoutes.receipt.method,
  {
    status: record.status, loadGeneration: record.loadGeneration, operationId: record.operationId,
    error: record.error, reports: record.reports, resolvedAddresses: record.resolvedAddresses,
  },
).then(parseDeployment);

async function operateInBrowser(id: string, action: "load" | "unload"): Promise<DeploymentRecord> {
  const record = (await gateway.list()).find(value => value.id === id);
  if (!record) throw new Error("Model deployment was not found");
  if (action === "load") {
    if (!["draft", "unloaded", "failed", "unknown"].includes(record.status)) throw new Error("Unload or reconcile the previous operation before loading again");
    validateDeployment(record);
  } else if (!record.loadGeneration || ["draft", "unloaded"].includes(record.status)) throw new Error("No load operation to unload");
  const snapshot = await request<{ agents: Array<{ id: string; host: string; port: number }> }>("/api/snapshot", "GET");
  const addresses = action === "unload" ? new Map(Object.entries(record.resolvedAddresses)) : new Map(snapshot.agents.map(agent => [agent.id, `tcp://${agent.host.includes(":") ? `[${agent.host}]` : agent.host}:${agent.port}`]));
  const ingressAddress = addresses.get(record.ingressAgentId);
  if (!ingressAddress) throw new Error("The deployment ingress agent is no longer registered");
  const connection = await BrowserP4Connection.open(record.ingressAgentId, ingressAddress);
  record.operationId = connection.operationId;
  record.status = action === "load" ? "loading" : "unloading";
  record.error = "";
  if (action === "load") {
    record.loadGeneration = Math.max(Date.now(), record.loadGeneration + 1);
    record.resolvedAddresses = Object.fromEntries(addresses);
    record.reports = record.stages.map(stage => ({ stageId: stage.id, state: "pending", detail: "", failureDetail: "", loadRequested: false, telemetry: null, updatedAt: new Date().toISOString() }));
  }
  await receipt(record);
  try { await runBrowserDeployment(record, action, addresses, connection, async () => { await receipt(record); }); }
  catch (error) { record.status = "unknown"; record.error = error instanceof Error ? error.message : String(error); await receipt(record); }
  return record;
}
export const startModels = () => deployments.start(gateway);
