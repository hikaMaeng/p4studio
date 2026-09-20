import { describe, expect, it } from "vitest";
import type { InferenceMonitoring, InferenceRun, P4BatchObservation, P4StageSpan } from "../../../common/protocol/inference/index.js";
import { appendMonitoring, InferenceTelemetryCache } from "./telemetry.js";

const batch: P4BatchObservation = {
  observation_id: "session:3:17", load_generation: 9, session_id: "session", logical_ordinal: 3, logical_rows: 5,
  physical_batches: [{ execution_id: 17, rows: 5, prefill_rows: 4, decode_rows: 1, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2, owned_requests: [] }],
  mixed_physical_batches: 1, stage_ms: 8, idle_ms: 2, idle_gated: 1, ready_rows: 7, ready_sequences: 3,
};
const span: P4StageSpan = { load_generation: 9, session_id: "session", execution_ids: [17], executions: [], rows: 5, ingress_unix_ms: 100, start_unix_ms: 102, end_unix_ms: 110, forward_unix_ms: 112 };

describe("InferenceTelemetryCache", () => {
  it("projects P4 batch and stage feedback for one exact node generation", () => {
    const cache = new InferenceTelemetryCache();
    cache.recordBatch("model", "tcp://agent:1", "node", 4, batch, "2026-09-11T00:00:00.000Z");
    cache.recordSpan("model", "tcp://agent:1", "node", 4, span, "2026-09-11T00:00:00.001Z");
    expect(cache.batch("model", "tcp://agent:1", "node", 4)).toMatchObject({ logicalOrdinal: 3, rows: 5, prefillRows: 4, decodeRows: 1, readyRows: 7, stageMs: 8 });
    expect(cache.span("model", "tcp://agent:1", "node", 4)).toMatchObject({ executionCount: 1, rows: 5, stageDurationMs: 8, totalDurationMs: 12 });
    expect(cache.batch("model", "tcp://agent:1", "node", 5)).toBeNull();
  });

  it("deduplicates identical snapshots and bounds retained run history", () => {
    const run: InferenceRun = { id: "run", modelId: "model", modelName: "model", state: "running", submitted: 1, completed: 0, createdAt: "2026-09-11T00:00:00.000Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null, telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: [] };
    const snapshot = (index: number): InferenceMonitoring => ({ modelId: "model", generatedAt: new Date(index).toISOString(), agents: [], nodes: [{ stageIndex: 0, agentId: "agent", agentName: "agent", nodeId: "node", nodeGeneration: 4, reachability: "reachable", observationState: "available", observedAt: new Date(index).toISOString(), adapterState: null, gpus: [], delivery: null, latestBatch: null, latestSpan: null, error: null }] });
    expect(appendMonitoring(run, snapshot(0))).toBe(true);
    expect(appendMonitoring(run, { ...snapshot(0), generatedAt: new Date(1).toISOString() })).toBe(false);
    expect(appendMonitoring(run, { ...snapshot(0), agents: [{ agentId: "agent", agentName: "agent", broker: { sampledAtUnixMs: 1, state: "ok", detail: null, duplicateWindow: 8, indexedEvents: 1, allocatedEvents: 2, allocatedEventBytes: 1024, allocatedPayloadCapacityBytes: 512, unmeasuredEvents: 0, peakAllocatedEventBytes: 1024, committedEvents: 2, evictedEvents: 0, freedEvents: 0, eventIndexCapacity: 8, orderCapacity: 8, sequenceEntries: 1, sequenceCapacity: 8 } }] })).toBe(true);
    for (let index = 1; index <= 250; index += 1) appendMonitoring(run, snapshot(index));
    expect(run.monitoring).toHaveLength(240);
    expect(run.monitoring.at(-1)?.generatedAt).toBe(new Date(250).toISOString());
  });
});
