import { agentGroupRoutes, agentGroupSchema } from "@p4studio/studio_domain/common";
import { agentGroups, type AgentGroupsGateway } from "@p4studio/studio_domain/front";
import { readAgentTopology } from "../../p4/reception.js";

const gateway: AgentGroupsGateway = {
  list: readAgentTopology,
  save: async (input, id) => {
    const route = id ? agentGroupRoutes.update : agentGroupRoutes.create;
    const response = await fetch(route.path.replace(":id", encodeURIComponent(id ?? "")), { method: route.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return agentGroupSchema.parse(await response.json());
  },
  remove: async id => {
    const response = await fetch(agentGroupRoutes.remove.path.replace(":id", encodeURIComponent(id)), { method: agentGroupRoutes.remove.method });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
};
export const startAgentGroups = () => agentGroups.start(gateway);
