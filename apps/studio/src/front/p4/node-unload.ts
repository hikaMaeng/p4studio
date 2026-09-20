import { decodeLifecycleMetadata, encodeLifecycleMetadata, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE, parseLifecycleRequest, parseLifecycleResult, sameEndpoint, type P4Endpoint } from "@p4studio/p4-protocol";
import { agentAddress, deploymentRoutes, LLAMA_TYPES, parseDeploymentList, type DeploymentRecord } from "@p4studio/studio_domain/common";
import { nodeUnload, type NodeUnloadTarget } from "@p4studio/studio_domain/front";
import { BrowserP4Reception, readAgentTopology } from "./reception.js";

async function request(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text();
  const value: unknown = raw ? JSON.parse(raw) : undefined;
  if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "object" && value.error !== null && "message" in value.error ? String(value.error.message) : `HTTP ${response.status}`);
  return value;
}

function matchingDeployment(records: DeploymentRecord[], target: NodeUnloadTarget): { record: DeploymentRecord; stageId: string } {
  const matches = records.flatMap(record => record.stages.flatMap(stage => {
    const report = record.reports.find(value => value.stageId === stage.id);
    return stage.agentId === target.agentId && stage.nodeId === target.nodeId && stage.nodeGeneration === target.nodeGeneration
      && record.adapter === target.adapterKind && record.loadGeneration > 0 && report?.loadOutcome === "succeeded" && report.resourceState === "present"
      ? [{ record, stageId: stage.id }] : [];
  }));
  if (matches.length !== 1) throw new Error(matches.length ? "Multiple Studio load receipts match this node; unload it from its model deployment." : "This observed node has no exact Studio load receipt, so its required load generation is unknown.");
  return matches[0]!;
}

async function unload(target: NodeUnloadTarget) {
  const records = parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method)).deployments;
  const { record, stageId } = matchingDeployment(records, target);
  const topology = await readAgentTopology();
  const agent = topology.agents.find(value => value.id === target.agentId);
  if (!agent) throw new Error("Target agent is no longer registered");
  const types = record.adapter === "llamacpp" ? LLAMA_TYPES : record;
  const metadata = parseLifecycleRequest({ schema: 1, node_id: target.nodeId, node_generation: target.nodeGeneration, adapter_kind: target.adapterKind, adapter_content_type: types.unloadContentType }, "unload");
  const payload = encodeLifecycleMetadata(metadata, new TextEncoder().encode(JSON.stringify({ load_generation: record.loadGeneration })));
  const connection = new BrowserP4Reception(topology);
  const endpoint: P4Endpoint = { kind: "agent", address: agentAddress(agent) };
  try {
    const reply = await connection.exchange(endpoint, record.adapter, NODE_UNLOAD_CONTENT_TYPE, payload, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE], record.timeoutMs);
    if (!sameEndpoint(reply.source, endpoint) || reply.adapterKind !== null || reply.contentType !== NODE_LIFECYCLE_RESULT_CONTENT_TYPE) throw new Error("P4 returned no matching lifecycle result; the unload outcome is unknown.");
    const decoded = decodeLifecycleMetadata(reply.payload), result = parseLifecycleResult(decoded.metadata);
    if (result.node_id !== target.nodeId || result.node_generation !== target.nodeGeneration || result.adapter_kind !== target.adapterKind || result.operation !== "unload") throw new Error("P4 lifecycle result does not match the selected node; the unload outcome is unknown.");
    if (result.status !== "succeeded" || result.resource_state !== "absent" || result.adapter_content_type !== types.unloadedContentType) throw new Error(result.first_error ?? "P4 did not confirm removal of this node.");
    const opaque: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded.opaque));
    if (!opaque || typeof opaque !== "object" || (opaque as Record<string, unknown>).load_generation !== record.loadGeneration) throw new Error("P4 unload completion load generation does not match the Studio receipt.");
    const report = record.reports.find(value => value.stageId === stageId)!;
    report.state = "unloaded"; report.resourceState = "absent"; report.lifecycle = { operation: "unload", status: "succeeded", resourceState: "absent", firstError: null, cleanupError: null }; report.detail = ""; report.updatedAt = new Date().toISOString();
    record.status = "failed"; record.error = `Stage ${target.nodeId} was unloaded individually; unload or recover the remaining stages before loading again.`; record.updatedAt = new Date().toISOString();
    await request(deploymentRoutes.receipt.path.replace(":id", encodeURIComponent(record.id)), deploymentRoutes.receipt.method, {
      status: record.status, loadGeneration: record.loadGeneration, operationId: record.operationId, error: record.error, reports: record.reports,
      resolvedAddresses: record.resolvedAddresses, stageGenerations: Object.fromEntries(record.stages.map(stage => [stage.id, stage.nodeGeneration])),
    });
  } finally { connection.close(); }
}

nodeUnload.start({ unload });
