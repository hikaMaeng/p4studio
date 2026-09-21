import { z } from "zod";

const identifier = z.string().trim().min(1).max(4096).refine(value => !value.includes("\0"));
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const finite = z.number().finite().nonnegative();

export const inferenceRunInputSchema = z.object({
  modelId: identifier,
  prompt: z.string().trim().min(1).max(131072).refine(value => !value.includes("\0")),
  concurrency: z.number().int().min(1).max(65536),
  repetitions: z.number().int().min(1).max(1000),
  intervalMs: z.number().int().min(0).max(86400000),
  // P4 combines prompt and generated tokens in one finite per-sequence
  // context. Studio therefore always sends an explicit, positive output cap.
  maxTokens: z.number().int().min(1).max(0xffff_ffff),
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
  waveIndex: z.number().int().min(1).nullable().default(null),
  submittedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
  telemetry: z.object({
    batchObservations: nonNegative,
    physicalBatches: nonNegative,
    issueCount: nonNegative,
    // Physical batches containing this request whose request_count > 1 (coalesced across requests). Not the P4
    // wire `mixed_physical_batches`, which counts prefill+decode phase mixing and lives only on the stage summary.
    multiRequestPhysicalBatches: nonNegative.default(0),
    prefillRows: nonNegative,
    decodeRows: nonNegative,
    verifyRows: nonNegative,
    replayRows: nonNegative,
    batchFillRatioSum: finite,
    batchFillSamples: nonNegative,
    // Samples in batchFillSamples whose denominator was the configured n_ubatch, not an execution-time cap.
    batchFillFallbackSamples: nonNegative.default(0),
    maxBatchFillRatio: finite,
    maxReadyRows: nonNegative,
    stages: z.array(z.object({
      stageIndex: nonNegative,
      agentName: z.string(),
      nodeId: identifier,
      spans: nonNegative,
      executions: nonNegative,
      rows: nonNegative,
      ingressQueueMs: nonNegative,
      sharedStageMs: nonNegative,
      forwardMs: nonNegative,
      firstIngressUnixMs: nonNegative.nullable(),
      lastForwardUnixMs: nonNegative.nullable(),
    })),
  }).default({ batchObservations: 0, physicalBatches: 0, issueCount: 0, multiRequestPhysicalBatches: 0, prefillRows: 0, decodeRows: 0, verifyRows: 0, replayRows: 0, batchFillRatioSum: 0, batchFillSamples: 0, batchFillFallbackSamples: 0, maxBatchFillRatio: 0, maxReadyRows: 0, stages: [] }),
});
export type InferenceRequest = z.infer<typeof inferenceRequestSchema>;
export type InferenceRequestTelemetry = InferenceRequest["telemetry"];

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
  delivery: z.object({ stopped: z.boolean(), inputRetained: nonNegative, completionRetained: nonNegative.nullable() }).nullable().default(null),
  latestBatch: inferenceBatchSchema.nullable(), latestSpan: inferenceStageSpanSchema.nullable().default(null), error: z.string().nullable().default(null),
});
export type InferenceNode = z.infer<typeof inferenceNodeSchema>;

export const inferenceBrokerSchema = z.object({
  sampledAtUnixMs: nonNegative,
  state: z.enum(["ok", "failed"]),
  detail: z.string().nullable(),
  duplicateWindow: nonNegative.nullable(),
  indexedEvents: nonNegative.nullable(),
  allocatedEvents: nonNegative.nullable(),
  allocatedEventBytes: nonNegative.nullable(),
  allocatedPayloadCapacityBytes: nonNegative.nullable(),
  unmeasuredEvents: nonNegative.nullable(),
  peakAllocatedEventBytes: nonNegative.nullable(),
  committedEvents: nonNegative.nullable(),
  evictedEvents: nonNegative.nullable(),
  freedEvents: nonNegative.nullable(),
  eventIndexCapacity: nonNegative.nullable(),
  orderCapacity: nonNegative.nullable(),
  sequenceEntries: nonNegative.nullable(),
  sequenceCapacity: nonNegative.nullable(),
});
export type InferenceBroker = z.infer<typeof inferenceBrokerSchema>;

export const inferenceAgentMonitoringSchema = z.object({ agentId: identifier, agentName: z.string(), broker: inferenceBrokerSchema.nullable() });
export type InferenceAgentMonitoring = z.infer<typeof inferenceAgentMonitoringSchema>;

export const inferenceMonitoringSchema = z.object({ modelId: identifier, generatedAt: z.string(), nodes: z.array(inferenceNodeSchema), agents: z.array(inferenceAgentMonitoringSchema).default([]) });
export type InferenceMonitoring = z.infer<typeof inferenceMonitoringSchema>;

export const inferenceStageMonitoringSummarySchema = z.object({
  stageIndex: nonNegative,
  agentName: z.string(),
  nodeId: identifier,
  batchObservations: nonNegative,
  stageSpans: nonNegative,
  physicalBatches: nonNegative,
  // P4 wire `mixed_physical_batches`: physical batches mixing prefill with decode/verify/replay phases (phase-mixed),
  // not batches shared by several requests (see request telemetry `multiRequestPhysicalBatches`).
  mixedPhysicalBatches: nonNegative,
  rows: nonNegative,
  prefillRows: nonNegative,
  decodeRows: nonNegative,
  verifyRows: nonNegative,
  replayRows: nonNegative,
  executionCount: nonNegative,
  batchStageMs: nonNegative,
  // Sum of P4 idle_ms from the second observation on. The first observation idle_ms measures time since the
  // stage previous completion, which can predate the run, so it is kept apart in initialIdleMs.
  idleMs: nonNegative,
  initialIdleMs: nonNegative.default(0),
  idleGated: nonNegative,
  spanStageMs: nonNegative,
  spanTotalMs: nonNegative,
  maxReadyRows: nonNegative,
  maxReadySequences: nonNegative,
  lastObservedAt: z.string().nullable(),
});
export type InferenceStageMonitoringSummary = z.infer<typeof inferenceStageMonitoringSummarySchema>;

export const inferenceMonitoringSummarySchema = z.object({
  batchObservations: nonNegative,
  stageSpans: nonNegative,
  stages: z.array(inferenceStageMonitoringSummarySchema),
});
export type InferenceMonitoringSummary = z.infer<typeof inferenceMonitoringSummarySchema>;

const inferenceOutputSeriesPointSchema = z.object({
  atUnixMs: nonNegative,
  tokens: nonNegative,
  completed: nonNegative,
  queued: nonNegative,
  streaming: nonNegative,
});
const inferenceBatchSeriesPointSchema = z.object({
  atUnixMs: nonNegative,
  stageIndex: nonNegative,
  observations: nonNegative,
  physicalBatches: nonNegative,
  // Denominator rows of this window; fallbackCapacityRows is the part taken from the configured n_ubatch.
  capacityRows: nonNegative,
  fallbackCapacityRows: nonNegative.default(0),
  rows: nonNegative,
  readyRowsMax: nonNegative,
  prefillRows: nonNegative,
  decodeRows: nonNegative,
  verifyRows: nonNegative,
  replayRows: nonNegative,
  stageMs: nonNegative,
  idleMs: nonNegative,
});
const inferenceSpanSeriesPointSchema = z.object({
  atUnixMs: nonNegative,
  stageIndex: nonNegative,
  spans: nonNegative,
  executions: nonNegative,
  rows: nonNegative,
  ingressQueueMs: nonNegative,
  stageMs: nonNegative,
  forwardMs: nonNegative,
});
export const inferenceTelemetrySeriesSchema = z.object({
  version: z.literal(1),
  output: z.array(inferenceOutputSeriesPointSchema),
  batches: z.array(inferenceBatchSeriesPointSchema),
  spans: z.array(inferenceSpanSeriesPointSchema),
}).default({ version: 1, output: [], batches: [], spans: [] });
export type InferenceTelemetrySeries = z.infer<typeof inferenceTelemetrySeriesSchema>;

export const inferenceRunSchema = z.object({
  id: identifier,
  modelId: identifier,
  modelName: identifier,
  state: z.enum(["preparing", "running", "completed", "failed", "unknown"]),
  submitted: nonNegative,
  completed: nonNegative,
  createdAt: z.string(),
  error: z.string().nullable(),
  nUbatch: nonNegative.default(0),
  monitoring: z.array(inferenceMonitoringSchema).default([]),
  monitoringSummary: inferenceMonitoringSummarySchema.nullable().default(null),
  telemetrySeries: inferenceTelemetrySeriesSchema,
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
