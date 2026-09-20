import { z } from "zod";

const id = z.string().trim().min(1).max(4096);
export const agentGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(80), gatewayAgentId: id,
  memberAgentIds: z.array(id).min(1).max(4096),
}).refine(value => new Set(value.memberAgentIds).size === value.memberAgentIds.length, "Duplicate group member")
  .refine(value => value.memberAgentIds.includes(value.gatewayAgentId), "Gateway must belong to its group");
export const agentGroupSchema = agentGroupInputSchema.safeExtend({ id });
export type AgentGroupInput = z.infer<typeof agentGroupInputSchema>;
export type AgentGroup = z.infer<typeof agentGroupSchema>;
export const agentGroupListSchema = z.object({ groups: z.array(agentGroupSchema) });
export type AgentGroupList = z.infer<typeof agentGroupListSchema>;
export type AgentGroupError = { error: { code: string; message: string } };
export const agentGroupRoutes = {
  list: { path: "/api/agent-groups", method: "GET" },
  create: { path: "/api/agent-groups", method: "POST" },
  update: { path: "/api/agent-groups/:id", method: "PUT" },
  remove: { path: "/api/agent-groups/:id", method: "DELETE" },
} as const;

type AgentAddress = { id: string; host: string; port: number };
export const agentAddress = (agent: AgentAddress) => `tcp://${agent.host.includes(":") ? `[${agent.host}]` : agent.host}:${agent.port}`;

// See docs/api.md#agent-groups. Membership selects reception, never the event target.
export function resolveAgentReception(targetId: string, agents: readonly AgentAddress[], groups: readonly AgentGroup[]) {
  const target = agents.find(agent => agent.id === targetId);
  if (!target) throw new Error("Target agent is no longer registered");
  const memberships = groups.filter(group => group.memberAgentIds.includes(targetId));
  if (memberships.length > 1) throw new Error("Agent belongs to multiple gateway groups");
  const group = memberships[0];
  if (group && !group.memberAgentIds.includes(group.gatewayAgentId)) throw new Error("Gateway is not a group member");
  const reception = group ? agents.find(agent => agent.id === group.gatewayAgentId) : target;
  if (!reception) throw new Error("Group gateway is no longer registered");
  return { agentId: reception.id, address: agentAddress(reception), groupId: group?.id ?? null };
}
