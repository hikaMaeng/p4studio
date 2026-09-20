import { describe, expect, it } from "vitest";
import type { InferenceMonitoring, InferenceRun, P4BatchObservation, P4StageSpan } from "../../../common/protocol/inference/index.js";
import { monitoringSummaryFor, recordBatchSummary, recordSpanSummary, requestMetrics, summarizeLegacyMonitoring, waveMetrics } from "./monitoring-summary.js";
import { emptyRequestTelemetry } from "./observability.js";

const run = (): InferenceRun => ({
  id: "run",
  modelId: "model",
  modelName: "model",
  state: "running",
  submitted: 2,
  completed: 1,
  createdAt: "2026-09-15T00:00:00.000Z",
  error: null,
  nUbatch: 8,
  monitoring: [],
  monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] },
  requests: [
    { id: "one", state: "completed", prompt: "p", text: "a", receivedTokens: 5, prefillTps: 20, generationTps: 4, ttftMs: 100, finalTps: 4, waveIndex: 1, submittedAt: "2026-09-15T00:00:00.000Z", completedAt: "2026-09-15T00:00:01.000Z", error: null, telemetry: emptyRequestTelemetry() },
    { id: "two", state: "streaming", prompt: "p", text: "b", receivedTokens: 3, prefillTps: null, generationTps: 2, ttftMs: 300, finalTps: null, waveIndex: 2, submittedAt: "2026-09-15T00:00:03.000Z", completedAt: null, error: null, telemetry: emptyRequestTelemetry() },
  ],
});

const stage = { stageIndex: 1, agentName: "agent-b", nodeId: "node-b" };
const batch: P4BatchObservation = {
  observation_id: "run:4:12",
  load_generation: 9,
  session_id: "run",
  logical_ordinal: 4,
  logical_rows: 7,
  physical_batches: [
    { execution_id: 12, rows: 7, prefill_rows: 2, decode_rows: 5, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2, owned_requests: [] },
  ],
  mixed_physical_batches: 1,
  stage_ms: 8,
  idle_ms: 3,
  idle_gated: 1,
  ready_rows: 9,
  ready_sequences: 3,
};
const span: P4StageSpan = {
  load_generation: 9,
  session_id: "run",
  execution_ids: [12, 13],
  executions: [],
  rows: 7,
  ingress_unix_ms: 100,
  start_unix_ms: 103,
  end_unix_ms: 111,
  forward_unix_ms: 115,
};

describe("inference monitoring summary", () => {
  it("aggregates accepted batch and span events by run and stage", () => {
    const value = run();
    recordBatchSummary(value, stage, batch, "2026-09-15T00:00:01.000Z");
    recordSpanSummary(value, stage, span, "2026-09-15T00:00:01.001Z");
    expect(recordBatchSummary(value, stage, batch, "2026-09-15T00:00:02.000Z")).toBe(false);
    expect(recordSpanSummary(value, stage, span, "2026-09-15T00:00:02.001Z")).toBe(false);
    expect(value.monitoringSummary).toMatchObject({ batchObservations: 1, stageSpans: 1 });
    expect(value.monitoringSummary?.stages[0]).toMatchObject({
      stageIndex: 1,
      batchObservations: 1,
      stageSpans: 1,
      physicalBatches: 1,
      rows: 7,
      prefillRows: 2,
      decodeRows: 5,
      executionCount: 2,
      batchStageMs: 8,
      idleMs: 3,
      spanStageMs: 8,
      spanTotalMs: 15,
      maxReadyRows: 9,
    });
  });

  it("deduplicates repeated legacy snapshots instead of counting displayed events", () => {
    const snapshot: InferenceMonitoring = {
      modelId: "model",
      generatedAt: "2026-09-15T00:00:01.000Z",
      agents: [],
      nodes: [{
        stageIndex: 1, agentId: "agent", agentName: "agent-b", nodeId: "node-b", nodeGeneration: 1,
        reachability: "reachable", observationState: "available", observedAt: "2026-09-15T00:00:01.000Z", adapterState: null, gpus: [], delivery: null, error: null,
        latestBatch: { observationId: "run:4:12", logicalOrdinal: 4, logicalRows: 7, physicalBatchCount: 1, mixedPhysicalBatches: 1, rows: 7, prefillRows: 2, decodeRows: 5, verifyRows: 0, replayRows: 0, requestCount: 2, sequenceCount: 2, stageMs: 8, idleMs: 3, idleGated: 1, readyRows: 9, readySequences: 3, scheduling: null, observedAt: "2026-09-15T00:00:01.000Z" },
        latestSpan: { executionCount: 2, rows: 7, ingressUnixMs: 100, startUnixMs: 103, endUnixMs: 111, forwardUnixMs: 115, stageDurationMs: 8, totalDurationMs: 15, observedAt: "2026-09-15T00:00:01.001Z" },
      }],
    };
    const summary = summarizeLegacyMonitoring([snapshot, { ...snapshot, generatedAt: "2026-09-15T00:00:02.000Z" }]);
    expect(summary).toMatchObject({ batchObservations: 1, stageSpans: 1 });
    expect(summary.stages[0]).toMatchObject({ rows: 7, executionCount: 2 });
  });

  it("summarizes request percentiles by each dispatch wave and falls back for old history", () => {
    const value = run();
    expect(requestMetrics(value)).toEqual({ totalTokens: 8, ttftP50Ms: 100, ttftP95Ms: 300, ttftMaxMs: 300, finalTpsP50: 4 });
    expect(waveMetrics(value)).toEqual([
      { waveIndex: 1, submitted: 1, completed: 1, sentAt: "2026-09-15T00:00:00.000Z", ttftP50Ms: 100, ttftP95Ms: 100, ttftMaxMs: 100 },
      { waveIndex: 2, submitted: 1, completed: 0, sentAt: "2026-09-15T00:00:03.000Z", ttftP50Ms: 300, ttftP95Ms: 300, ttftMaxMs: 300 },
    ]);
    expect(monitoringSummaryFor(value)).toEqual({ batchObservations: 0, stageSpans: 0, stages: [] });
  });
});
