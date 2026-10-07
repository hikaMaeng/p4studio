import { agentAddress, modelRequestOwnersSchema, modelRequestRoutes, type DeploymentRecord, type GraphAgent, type GraphAgentList } from "@p4studio/studio_domain/common";
import { observeModelRequests, type ModelRequestsGateway } from "@p4studio/studio_domain/front";
import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import { inspectGraphAgent } from "../../../p4/inspection.js";
import { readAgentTopology } from "../../../p4/reception.js";
import { clearModelRequests } from "../api.js";

// Shared per-agent observations, at most two P4 inspections in flight.
const cache = new Map<string, { time: number; value: Promise<P4AgentSnapshot | Error> }>();
let active = 0;
const waiting: Array<() => void> = [];
async function inspect(agent: GraphAgent, topology: GraphAgentList) {
  const key = JSON.stringify([agent, topology.groups]), previous = cache.get(key);
  if (previous && Date.now() - previous.time < 5000) return previous.value;
  const entry = { time: Infinity, value: (async () => {
    if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve)); else active++;
    try { return await inspectGraphAgent(agent, topology); }
    catch (error) { return error instanceof Error ? error : new Error(String(error)); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  })() };
  cache.set(key, entry); void entry.value.then(() => { entry.time = Date.now(); }); return entry.value;
}
export const requestsGateway: ModelRequestsGateway = {
  inspect: async (record: DeploymentRecord, fresh = false) => {
    if (fresh) cache.clear();
    for (const [key, entry] of cache) if (Date.now() - entry.time > 60_000) cache.delete(key);
    const response = await fetch(modelRequestRoutes.owners.path.replace(":id", encodeURIComponent(record.id)), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Request owner lookup failed: HTTP ${response.status}`);
    const owners = modelRequestOwnersSchema.parse(await response.json());
    const values = new Map<string, P4AgentSnapshot | Error>(), topology = await readAgentTopology();
    await Promise.all([...new Set(record.stages.map(stage => stage.agentId))].map(async id => {
      const agent = topology.agents.find(value => value.id === id), address = record.resolvedAddresses[id];
      values.set(id, !agent || address && address !== agentAddress(agent) ? new Error("Agent endpoint differs from the recorded LOAD") : await inspect(agent, topology));
    }));
    const observedAt = new Date().toISOString();
    return { owners: owners.owners, stages: observeModelRequests(record, values, observedAt), observedAt };
  },
  clear: async record => { cache.clear(); try { await clearModelRequests(record); } finally { cache.clear(); } },
};
