import { describe, expect, it } from "vitest";
import { parseP4BatchObservation, parseP4StageSpan, type InferenceRun, type P4BatchObservation, type P4StageSpan } from "../../../common/protocol/inference/index.js";
import { emptyRequestTelemetry, recordBatchObservability, recordOutputObservability, projectPhaseWorkSeries, recordSpanObservability, requestBatchFillRatio } from "./observability.js";

const run = (): InferenceRun => ({
  id: "run", modelId: "model", modelName: "model", state: "running", submitted: 1, completed: 0,
  createdAt: "2026-09-15T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] },
  requests: [{ id: "request", state: "streaming", prompt: "p", text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, waveIndex: 1, submittedAt: "2026-09-15T00:00:00.000Z", completedAt: null, error: null, telemetry: emptyRequestTelemetry() }],
});

const reply = { ingress_agent: "tcp://127.0.0.1:42500", channel: "studio-channel", connection_generation: 1, correlation_id: "operation", deadline_unix_ms: null };

const batch: P4BatchObservation = {
  observation_id: "observation", load_generation: 1, session_id: "run", logical_ordinal: 1, logical_rows: 4,
  physical_batches: [{ execution_id: 7, rows: 4, prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2,
    owned_requests: [{ request_id: "request", reply, submission_event_id: "submitted", sequence_id: 0, incarnation: 1, request_issue_index: 1, rows: [], prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0 }] }],
  mixed_physical_batches: 1, stage_ms: 10, idle_ms: 2, idle_gated: 0, ready_rows: 6, ready_sequences: 2,
};

const physicalOf = (rows: number) => ({ ...batch.physical_batches[0]!, rows, prefill_rows: rows, decode_rows: 0, request_count: 1, sequence_count: 1 });
const withCap = (cap: number | undefined, rows: number[]): P4BatchObservation => ({
  ...batch, physical_batches: rows.map(physicalOf),
  ...(cap === undefined ? { scheduling: undefined } : { scheduling: { max_issue_rows: cap } }),
});
const stage0 = { stageIndex: 0, agentName: "agent", nodeId: "node" };
const stage1 = { stageIndex: 1, agentName: "agent-b", nodeId: "node-b" };

const span: P4StageSpan = {
  load_generation: 1, session_id: "run", execution_ids: [7], executions: [{ execution_id: 7, owned_requests: [{ request_id: "request", reply, sequence_id: 0, incarnation: 1 }] }],
  rows: 4, ingress_unix_ms: 1000, start_unix_ms: 1002, end_unix_ms: 1012, forward_unix_ms: 1015,
};

describe("inference observability aggregation", () => {
  it("keeps request ownership while bucketing service series", () => {
    const value = run();
    recordBatchObservability(value, { stageIndex: 0, agentName: "agent", nodeId: "node" }, batch, "2026-09-15T00:00:01.200Z");
    recordSpanObservability(value, { stageIndex: 0, agentName: "agent", nodeId: "node" }, span, "2026-09-15T00:00:01.300Z");
    expect(value.telemetrySeries.batches[0]).toMatchObject({ observations: 1, capacityRows: 8, rows: 4, readyRowsMax: 6, prefillRows: 3, decodeRows: 1 });
    expect(value.telemetrySeries.spans[0]).toMatchObject({ spans: 1, executions: 1, ingressQueueMs: 2, stageMs: 10, forwardMs: 3 });
    expect(value.requests[0]!.telemetry).toMatchObject({ batchObservations: 1, issueCount: 1, multiRequestPhysicalBatches: 1, prefillRows: 3, decodeRows: 1, maxReadyRows: 6 });
    expect(value.requests[0]!.telemetry.stages[0]).toMatchObject({ stageIndex: 0, executions: 1, sharedStageMs: 10, ingressQueueMs: 2, forwardMs: 3 });
    expect(requestBatchFillRatio(value.requests[0]!)).toBe(.5);
  });

  it("uses the execution issue cap over a stale configured n_ubatch: one row against cap 10 is 10%", () => {
    const value = { ...run(), nUbatch: 128 };
    recordBatchObservability(value, stage0, withCap(10, [1]), "2026-09-15T00:00:01.200Z");
    expect(value.telemetrySeries.batches[0]).toMatchObject({ physicalBatches: 1, rows: 1, capacityRows: 10, fallbackCapacityRows: 0 });
    expect(requestBatchFillRatio(value.requests[0]!)).toBe(.1);
    expect(value.requests[0]!.telemetry).toMatchObject({ maxBatchFillRatio: .1, batchFillSamples: 1, batchFillFallbackSamples: 0 });
  });

  it("falls back to the configured n_ubatch, marked as fallback, when scheduling is absent or names no issue limit", () => {
    for (const cap of [undefined, 0]) {
      const value = run();
      recordBatchObservability(value, stage0, withCap(cap, [2]), "2026-09-15T00:00:01.200Z");
      expect(value.telemetrySeries.batches[0]).toMatchObject({ capacityRows: 8, fallbackCapacityRows: 8 });
      expect(requestBatchFillRatio(value.requests[0]!)).toBe(.25);
      expect(value.requests[0]!.telemetry.batchFillFallbackSamples).toBe(1);
    }
  });

  it("records no denominator and no fill sample when neither an execution cap nor a configured n_ubatch exists", () => {
    const value = { ...run(), nUbatch: 0 };
    recordBatchObservability(value, stage0, withCap(0, [3]), "2026-09-15T00:00:01.200Z");
    expect(value.telemetrySeries.batches[0]).toMatchObject({ rows: 3, capacityRows: 0, fallbackCapacityRows: 0 });
    expect(requestBatchFillRatio(value.requests[0]!)).toBeNull();
    expect(value.requests[0]!.telemetry).toMatchObject({ batchFillSamples: 0, maxBatchFillRatio: 0, issueCount: 1 });
  });

  it("applies one per-observation capacity to the graph and request fill across physical batches and stages", () => {
    const value = { ...run(), nUbatch: 128 };
    recordBatchObservability(value, stage0, withCap(10, [1, 5]), "2026-09-15T00:00:01.200Z");
    recordBatchObservability(value, stage1, withCap(4, [2]), "2026-09-15T00:00:01.400Z");
    expect(value.telemetrySeries.batches.map(({ stageIndex, physicalBatches, rows, capacityRows }) => ({ stageIndex, physicalBatches, rows, capacityRows })))
      .toEqual([{ stageIndex: 0, physicalBatches: 2, rows: 6, capacityRows: 20 }, { stageIndex: 1, physicalBatches: 1, rows: 2, capacityRows: 4 }]);
    const telemetry = value.requests[0]!.telemetry;
    expect(telemetry).toMatchObject({ batchFillSamples: 3, batchFillFallbackSamples: 0, maxBatchFillRatio: .5 });
    expect(requestBatchFillRatio(value.requests[0]!)).toBeCloseTo((.1 + .5 + .5) / 3, 12);
  });

  it("counts a request's multi-request physical batches separately from P4 phase-mixed batches", () => {
    const value = run();
    // request_count 2 but a prefill-only batch: multi-request, yet the wire counts it as not phase-mixed.
    const multiRequestPrefillOnly: P4BatchObservation = { ...batch, mixed_physical_batches: 0, physical_batches: [{ ...batch.physical_batches[0]!, prefill_rows: 4, decode_rows: 0, request_count: 2 }] };
    recordBatchObservability(value, stage0, multiRequestPrefillOnly, "2026-09-15T00:00:01.200Z");
    recordBatchObservability(value, stage0, { ...batch, mixed_physical_batches: 1, physical_batches: [{ ...batch.physical_batches[0]!, request_count: 1 }] }, "2026-09-15T00:00:02.200Z");
    expect(value.requests[0]!.telemetry.multiRequestPhysicalBatches).toBe(1);
    expect(value.requests[0]!.telemetry).not.toHaveProperty("mixedPhysicalBatches");
  });

  it("projects phase work as the per-physical-batch average so one-second bucketing does not alias width-10 issues", () => {
    const value = run();
    const width10 = withCap(10, [10]);
    recordBatchObservability(value, stage0, width10, "2026-09-15T00:00:01.100Z");
    recordBatchObservability(value, stage0, width10, "2026-09-15T00:00:01.700Z");
    recordBatchObservability(value, stage0, width10, "2026-09-15T00:00:02.300Z");
    // Storage buckets stay summed: 20 rows in second 1, 10 in second 2.
    expect(value.telemetrySeries.batches.map(({ atUnixMs, physicalBatches, prefillRows }) => ({ atUnixMs, physicalBatches, prefillRows })))
      .toEqual([{ atUnixMs: 1_789_430_401_000, physicalBatches: 2, prefillRows: 20 }, { atUnixMs: 1_789_430_402_000, physicalBatches: 1, prefillRows: 10 }]);
    expect(projectPhaseWorkSeries(value.telemetrySeries.batches)).toEqual([
      { atUnixMs: 1_789_430_401_000, prefillRowsPerBatch: 10, decodeRowsPerBatch: 0, readyRowsMax: 6 },
      { atUnixMs: 1_789_430_402_000, prefillRowsPerBatch: 10, decodeRowsPerBatch: 0, readyRowsMax: 6 },
    ]);
  });

  it("pools stages in one bucket, keeps the ready-row maximum, and emits no phase point without physical batches", () => {
    const value = run();
    recordBatchObservability(value, stage0, withCap(10, [4, 8]), "2026-09-15T00:00:01.100Z");
    recordBatchObservability(value, stage1, { ...withCap(10, [6]), ready_rows: 11 }, "2026-09-15T00:00:01.200Z");
    recordBatchObservability(value, stage0, { ...withCap(10, []), ready_rows: 3 }, "2026-09-15T00:00:02.100Z");
    const projected = projectPhaseWorkSeries(value.telemetrySeries.batches);
    expect(projected[0]).toEqual({ atUnixMs: 1_789_430_401_000, prefillRowsPerBatch: 6, decodeRowsPerBatch: 0, readyRowsMax: 11 });
    expect(projected[1]).toEqual({ atUnixMs: 1_789_430_402_000, prefillRowsPerBatch: null, decodeRowsPerBatch: null, readyRowsMax: 3 });
    expect(projectPhaseWorkSeries([])).toEqual([]);
    for (const point of projected) for (const field of [point.prefillRowsPerBatch, point.decodeRowsPerBatch]) expect(field === null || Number.isFinite(field)).toBe(true);
  });

  it("coalesces output counts into one-second service windows", () => {
    const value = run();
    recordOutputObservability(value, 1200, false);
    value.requests[0]!.state = "completed";
    recordOutputObservability(value, 1500, true);
    expect(value.telemetrySeries.output).toEqual([{ atUnixMs: 1000, tokens: 2, completed: 1, queued: 0, streaming: 0 }]);
  });

  it("attributes literal v5 wire telemetry to the exact request and stage", () => {
    const value = run();
    const wireBatch = parseP4BatchObservation(JSON.parse(JSON.stringify(batch)));
    const wireSpan = parseP4StageSpan(JSON.parse(JSON.stringify(span)));
    recordBatchObservability(value, { stageIndex: 1, agentName: "agent-b", nodeId: "node-b" }, wireBatch, "2026-09-15T00:00:01.200Z");
    recordSpanObservability(value, { stageIndex: 1, agentName: "agent-b", nodeId: "node-b" }, wireSpan, "2026-09-15T00:00:01.300Z");
    expect(value.requests).toHaveLength(1);
    expect(value.requests[0]!.telemetry).toMatchObject({ batchObservations: 1, issueCount: 1, prefillRows: 3, decodeRows: 1 });
    expect(value.requests[0]!.telemetry.stages).toEqual([expect.objectContaining({ stageIndex: 1, agentName: "agent-b", nodeId: "node-b", spans: 1, executions: 1, sharedStageMs: 10 })]);
    expect(value.telemetrySeries.batches[0]).toMatchObject({ stageIndex: 1, observations: 1 });
    expect(value.telemetrySeries.spans[0]).toMatchObject({ stageIndex: 1, spans: 1 });
  });
});
