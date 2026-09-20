import { useEffect } from "react";
import { graphAgentSchema, graphInventoryRoutes, nodeLabelListSchema, nodeLabelSchema } from "@p4studio/studio_domain/common";
import { graphInventory, type GraphInventoryGateway } from "@p4studio/studio_domain/front";
import type { StudioSnapshot } from "../../common/domain.js";
import { useModel } from "../model/useModel.js";
import { inspectGraphAgent } from "./inspection.js";

async function request(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

const gateway: GraphInventoryGateway = {
  inspect: inspectGraphAgent,
  saveObservation: async (id, observation) => {
    const route = graphInventoryRoutes.recordObservation;
    await request(route.path.replace(":id", encodeURIComponent(id)), route.method, { observedAt: observation.inspectedAt, snapshot: observation.snapshot });
  },
  labels: async () => nodeLabelListSchema.parse(await request(graphInventoryRoutes.labels.path, graphInventoryRoutes.labels.method)).labels,
  renameAgent: async (id, name) => graphAgentSchema.parse(await request(graphInventoryRoutes.renameAgent.path.replace(":id", encodeURIComponent(id)), graphInventoryRoutes.renameAgent.method, { name })),
  renameNode: async (id, input) => nodeLabelSchema.parse(await request(graphInventoryRoutes.renameNode.path.replace(":id", encodeURIComponent(id)), graphInventoryRoutes.renameNode.method, input)),
};

export function useGraphInventory(snapshot: StudioSnapshot): StudioSnapshot {
  const names = useModel(graphInventory.names).value;
  const observations = useModel(graphInventory.observations).value;
  useEffect(() => graphInventory.start(gateway), []);
  return { ...snapshot, agents: snapshot.agents.map(agent => {
    const observation = observations.get(agent.id);
    return { ...agent, name: names.get(agent.id) ?? agent.name,
      inspection: observation ? { ...observation, state: "available" as const, error: null } : agent.inspection };
  }) };
}
