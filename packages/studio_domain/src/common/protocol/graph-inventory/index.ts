import { z } from "zod";

export const graphNameSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const nodeLabelInputSchema = graphNameSchema.extend({ nodeId: z.string().min(1).max(4096) });
export const nodeLabelSchema = nodeLabelInputSchema.extend({ agentId: z.string().min(1), updatedAt: z.string() });
export type NodeLabel = z.infer<typeof nodeLabelSchema>;
export type NodeLabelInput = z.infer<typeof nodeLabelInputSchema>;
export const graphAgentSchema = graphNameSchema.extend({ id: z.string().min(1), host: z.string().min(1), port: z.number().int().positive() });
export type GraphAgent = z.infer<typeof graphAgentSchema>;
export const graphAgentListSchema = z.object({ agents: z.array(graphAgentSchema) });
export type GraphAgentList = z.infer<typeof graphAgentListSchema>;
export const nodeLabelListSchema = z.object({ labels: z.array(nodeLabelSchema) });
export type NodeLabelList = z.infer<typeof nodeLabelListSchema>;
export const graphInventoryRoutes = {
  agents: { path: "/api/graph-agents", method: "GET" },
  labels: { path: "/api/node-labels", method: "GET" },
  renameAgent: { path: "/api/agents/:id/name", method: "PATCH" },
  renameNode: { path: "/api/agents/:id/node-labels", method: "PUT" },
} as const;
export const nodeLabelKey = (agentId: string, nodeId: string) => JSON.stringify([agentId, nodeId]);
