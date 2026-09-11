import { z } from "zod";

const identifier = z.string().trim().min(1).max(4096).refine(value => !value.includes("\0"));
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite().nonnegative();

export const inferenceRunInputSchema = z.object({
  modelId: identifier,
  prompt: z.string().trim().min(1).max(131072).refine(value => !value.includes("\0")),
  concurrency: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(40)]),
  repetitions: z.number().int().min(1).max(1000),
  intervalMs: z.number().int().min(0).max(86400000),
  maxTokens: z.number().int().min(1).max(32768),
});
export type InferenceRunInput = z.infer<typeof inferenceRunInputSchema>;

export const inferenceRequestSchema = z.object({
  id: identifier,
  state: z.enum(["queued", "streaming", "completed", "failed", "unknown"]),
  prompt: z.string(),
  text: z.string(),
  receivedTokens: nonNegative,
  prefillTps: finite.nullable(),
  generationTps: finite.nullable(),
  ttftMs: nonNegative.nullable(),
  finalTps: finite.nullable(),
  submittedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type InferenceRequest = z.infer<typeof inferenceRequestSchema>;

export const inferenceGpuSchema = z.object({
  index: nonNegative, name: z.string(), vramUsedBytes: nonNegative, vramFreeBytes: nonNegative,
  utilizationGpuPercent: nonNegative.nullable(), temperatureC: nonNegative.nullable(), powerDrawW: finite.nullable(),
});
export type InferenceGpu = z.infer<typeof inferenceGpuSchema>;

export const inferenceBatchSchema = z.object({
  observationId: z.string().default(""), logicalOrdinal: nonNegative.default(0), logicalRows: nonNegative.default(0),
  physicalBatchCount: nonNegative.default(0), mixedPhysicalBatches: nonNegative.default(0),
  rows: nonNegative, prefillRows: nonNegative, decodeRows: nonNegative, verifyRows: nonNegative, replayRows: nonNegative,
  requestCount: nonNegative, sequenceCount: nonNegative, stageMs: nonNegative, idleMs: nonNegative, idleGated: nonNegative.default(0), readyRows: nonNegative, readySequences: nonNegative,
  scheduling: z.unknown().nullable().default(null), observedAt: z.string().default(""),
});
export type InferenceBatch = z.infer<typeof inferenceBatchSchema>;

export const inferenceStageSpanSchema = z.object({
  executionCount: nonNegative, rows: nonNegative,
  ingressUnixMs: nonNegative, startUnixMs: nonNegative, endUnixMs: nonNegative, forwardUnixMs: nonNegative,
  stageDurationMs: nonNegative, totalDurationMs: nonNegative, observedAt: z.string(),
});
export type InferenceStageSpan = z.infer<typeof inferenceStageSpanSchema>;

export const inferenceNodeSchema = z.object({
  stageIndex: nonNegative, agentId: identifier, agentName: z.string(), nodeId: identifier, nodeGeneration: nonNegative,
  reachability: z.enum(["unknown", "reachable", "unreachable"]), observationState: z.enum(["pending", "available", "error"]),
  observedAt: z.string().nullable(), adapterState: z.unknown().nullable(), gpus: z.array(inferenceGpuSchema),
  latestBatch: inferenceBatchSchema.nullable(), latestSpan: inferenceStageSpanSchema.nullable().default(null), error: z.string().nullable().default(null),
});
export type InferenceNode = z.infer<typeof inferenceNodeSchema>;

export const inferenceMonitoringSchema = z.object({ modelId: identifier, generatedAt: z.string(), nodes: z.array(inferenceNodeSchema) });
export type InferenceMonitoring = z.infer<typeof inferenceMonitoringSchema>;

export const inferenceRunSchema = z.object({
  id: identifier,
  modelId: identifier,
  modelName: identifier,
  state: z.enum(["preparing", "running", "completed", "failed", "unknown"]),
  submitted: nonNegative,
  completed: nonNegative,
  createdAt: z.string(),
  error: z.string().nullable(),
  monitoring: z.array(inferenceMonitoringSchema).default([]),
  requests: z.array(inferenceRequestSchema),
});
export type InferenceRun = z.infer<typeof inferenceRunSchema>;

export const inferenceRunsSchema = z.object({ runs: z.array(inferenceRunSchema) });
export type InferenceRunsResponse = z.infer<typeof inferenceRunsSchema>;

export const inferenceRoutes = {
  runs: { path: "/api/inference/runs", method: "GET" },
  createRun: { path: "/api/inference/runs", method: "POST" },
  runEvents: { path: "/api/inference/runs/:id/events", method: "GET" },
  monitoring: { path: "/api/inference/models/:id/monitoring", method: "GET" },
} as const;

export const parseInferenceRuns = (value: unknown): InferenceRunsResponse => inferenceRunsSchema.parse(value);
export const parseInferenceRun = (value: unknown): InferenceRun => inferenceRunSchema.parse(value);
export const parseInferenceMonitoring = (value: unknown): InferenceMonitoring => inferenceMonitoringSchema.parse(value);
export * from "./telemetry.js";
