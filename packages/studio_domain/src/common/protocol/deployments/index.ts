import { z } from "zod";

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().min(1).max(4096).refine(v => !v.includes("\0"));
export const stageSchema = z.object({
  id: text, agentId: z.string().max(4096), nodeId: text, nodeGeneration: positive, createNode: z.boolean(),
  artifact: z.string().max(4096), layerStart: z.number().int().min(0), layerEnd: positive,
  binary: z.string().max(4096), endpoint: z.string().max(256), device: z.string().max(128),
  options: z.string().max(32768), argsJson: z.string().max(32768), environmentJson: z.string().max(32768),
  customPayload: z.string().max(131072),
  planText: z.string().max(131072).optional(), loadOptionsJson: z.string().max(131072).optional(),
  referenceAgent: z.string().max(4096).optional(),
});
export const deploymentInputSchema = z.object({
  name: text, adapter: text, ingressAgentId: z.string().max(4096), totalLayers: positive,
  contextSize: positive, sequenceCapacity: positive, nBatch: positive, nUbatch: positive,
  timeoutMs: positive.max(86400000),
  presetId: z.string().max(256).optional(),
  pipelineCompatibility: z.enum(["exact-build", "physical-wire-v4"]).optional(),
  loadContentType: z.string().max(256), loadedContentType: z.string().max(256),
  unloadContentType: z.string().max(256), unloadedContentType: z.string().max(256), errorContentType: z.string().max(256),
  stages: z.array(stageSchema).max(128),
});
export type DeploymentInput = z.infer<typeof deploymentInputSchema>;
export type PlacementStage = z.infer<typeof stageSchema>;
export const stageStateSchema = z.enum(["pending", "creating", "loading", "ready", "unloading", "unloaded", "failed", "unknown"]);
export type StageState = z.infer<typeof stageStateSchema>;
export const reportSchema = z.object({ stageId: z.string(), state: stageStateSchema, detail: z.string(), failureDetail: z.string().default(""), loadRequested: z.boolean().default(false), updatedAt: z.string(), telemetry: z.unknown() });
export type StageReport = z.infer<typeof reportSchema>;
export const deploymentSchema = deploymentInputSchema.extend({
  id: text, status: z.enum(["draft", "loading", "ready", "unloading", "unloaded", "failed", "unknown"]),
  loadGeneration: z.number().int().min(0), operationId: z.string(), error: z.string(),
  reports: z.array(reportSchema), resolvedAddresses: z.record(z.string(), z.string()).default({}), createdAt: z.string(), updatedAt: z.string(),
});
export type DeploymentRecord = z.infer<typeof deploymentSchema>;
export const deploymentReceiptSchema = z.object({
  status: deploymentSchema.shape.status,
  loadGeneration: deploymentSchema.shape.loadGeneration,
  operationId: deploymentSchema.shape.operationId,
  error: deploymentSchema.shape.error,
  reports: deploymentSchema.shape.reports,
  resolvedAddresses: deploymentSchema.shape.resolvedAddresses,
});
export type DeploymentReceipt = z.infer<typeof deploymentReceiptSchema>;
export const deploymentRoutes = {
  list: { path: "/api/model-deployments", method: "GET" },
  create: { path: "/api/model-deployments", method: "POST" },
  update: { path: "/api/model-deployments/:id", method: "PUT" },
  load: { path: "/api/model-deployments/:id/load", method: "POST" },
  unload: { path: "/api/model-deployments/:id/unload", method: "POST" },
  receipt: { path: "/api/model-deployments/:id/receipt", method: "PUT" },
} as const;
export type DeploymentListResponse = { deployments: DeploymentRecord[] };
export const parseDeploymentList = (value: unknown): DeploymentListResponse => z.object({ deployments: z.array(deploymentSchema) }).parse(value);
export const parseDeployment = (value: unknown): DeploymentRecord => deploymentSchema.parse(value);
export type DeploymentErrorResponse = { error: { code: string; message: string } };
