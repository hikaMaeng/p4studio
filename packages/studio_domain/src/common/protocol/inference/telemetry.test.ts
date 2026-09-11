import { describe, expect, it } from "vitest";
import { parseP4BatchObservation, parseP4StageSpan } from "./telemetry.js";

const physical = {
  execution_id: 11, rows: 4, prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2,
  owned_requests: [{ request_id: "request-1", submission_event_id: "event-1", sequence_id: 0, incarnation: 1, request_issue_index: 1, rows: [], prefill_rows: 3, decode_rows: 0, verify_rows: 0, replay_rows: 0 }],
};

describe("P4 inference telemetry wire", () => {
  it("parses the current batch-observation-v4 payload including pacing", () => {
    const value = parseP4BatchObservation({ scheduling: { min_batch_rows: 1 }, observation_id: "session:1:11", load_generation: 7, session_id: "session", logical_ordinal: 1, logical_rows: 4, physical_batches: [physical], mixed_physical_batches: 1, stage_ms: 9, idle_ms: 3, idle_gated: 2, ready_rows: 6, ready_sequences: 2 });
    expect(value.physical_batches[0]?.owned_requests[0]?.prefill_rows).toBe(3);
    expect(value).toMatchObject({ stage_ms: 9, idle_ms: 3, idle_gated: 2, ready_rows: 6, ready_sequences: 2 });
  });

  it("rejects invented or legacy batch fields", () => {
    expect(() => parseP4BatchObservation({ observation_id: "o", load_generation: 7, session_id: "session", logical_ordinal: 1, logical_rows: 4, physical_batches: [{ ...physical, requests: physical.owned_requests }], mixed_physical_batches: 0 })).toThrow();
  });

  it("parses the current stage-span-v4 payload", () => {
    const value = parseP4StageSpan({ load_generation: 7, session_id: "session", execution_ids: [11], executions: [{ execution_id: 11, owned_requests: [{ request_id: "request-1", sequence_id: 0, incarnation: 1 }] }], rows: 4, ingress_unix_ms: 100, start_unix_ms: 102, end_unix_ms: 111, forward_unix_ms: 113 });
    expect(value.execution_ids).toEqual([11]);
    expect(value.forward_unix_ms - value.ingress_unix_ms).toBe(13);
  });
});
