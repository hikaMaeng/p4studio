import { describe, expect, it } from "vitest";
import type { InferenceRun, P4BatchObservation, P4StageSpan } from "../../../common/protocol/inference/index.js";
import { emptyRequestTelemetry, recordBatchObservability, recordOutputObservability, recordSpanObservability, requestBatchFillRatio } from "./observability.js";

const run = (): InferenceRun => ({
  id: "run", modelId: "model", modelName: "model", state: "running", submitted: 1, completed: 0,
  createdAt: "2026-09-15T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null,
  telemetrySeries: { version: 1, output: [], batches: [], spans: [] },
  requests: [{ id: "request", state: "streaming", prompt: "p", text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, waveIndex: 1, submittedAt: "2026-09-15T00:00:00.000Z", completedAt: null, error: null, telemetry: emptyRequestTelemetry() }],
});

const batch: P4BatchObservation = {
  observation_id: "observation", load_generation: 1, session_id: "run", logical_ordinal: 1, logical_rows: 4,
  physical_batches: [{ execution_id: 7, rows: 4, prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2,
    owned_requests: [{ request_id: "request", submission_event_id: "submitted", sequence_id: 0, incarnation: 1, request_issue_index: 1, rows: [], prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0 }] }],
  mixed_physical_batches: 1, stage_ms: 10, idle_ms: 2, idle_gated: 0, ready_rows: 6, ready_sequences: 2,
};

const span: P4StageSpan = {
  load_generation: 1, session_id: "run", execution_ids: [7], executions: [{ execution_id: 7, owned_requests: [{ request_id: "request", sequence_id: 0, incarnation: 1 }] }],
  rows: 4, ingress_unix_ms: 1000, start_unix_ms: 1002, end_unix_ms: 1012, forward_unix_ms: 1015,
};

describe("inference observability aggregation", () => {
  it("keeps request ownership while bucketing service series", () => {
    const value = run();
    recordBatchObservability(value, { stageIndex: 0, agentName: "agent", nodeId: "node" }, batch, "2026-09-15T00:00:01.200Z");
    recordSpanObservability(value, { stageIndex: 0, agentName: "agent", nodeId: "node" }, span, "2026-09-15T00:00:01.300Z");
    expect(value.telemetrySeries.batches[0]).toMatchObject({ observations: 1, capacityRows: 8, rows: 4, readyRowsMax: 6, prefillRows: 3, decodeRows: 1 });
    expect(value.telemetrySeries.spans[0]).toMatchObject({ spans: 1, executions: 1, ingressQueueMs: 2, stageMs: 10, forwardMs: 3 });
    expect(value.requests[0]!.telemetry).toMatchObject({ batchObservations: 1, issueCount: 1, mixedPhysicalBatches: 1, prefillRows: 3, decodeRows: 1, maxReadyRows: 6 });
    expect(value.requests[0]!.telemetry.stages[0]).toMatchObject({ stageIndex: 0, executions: 1, sharedStageMs: 10, ingressQueueMs: 2, forwardMs: 3 });
    expect(requestBatchFillRatio(value.requests[0]!)).toBe(.5);
  });

  it("coalesces output counts into one-second service windows", () => {
    const value = run();
    recordOutputObservability(value, 1200, false);
    value.requests[0]!.state = "completed";
    recordOutputObservability(value, 1500, true);
    expect(value.telemetrySeries.output).toEqual([{ atUnixMs: 1000, tokens: 2, completed: 1, queued: 0, streaming: 0 }]);
  });
});
