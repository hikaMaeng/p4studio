import { describe, expect, it } from "vitest";
import { classifyP4Telemetry, P4_BATCH_OBSERVATION_CONTENT_TYPE, P4_STAGE_SPAN_CONTENT_TYPE, parseP4BatchObservation, parseP4StageSpan } from "./telemetry.js";

// Shapes follow P4 llamacpp adapter v2/commands.rs (BatchObservation, StageSpan, ReplySpec), all deny_unknown_fields.
const reply = { ingress_agent: "tcp://127.0.0.1:42500", channel: "studio-channel", connection_generation: 1, correlation_id: "operation", deadline_unix_ms: null };
const physical = {
  execution_id: 11, rows: 4, prefill_rows: 3, decode_rows: 1, verify_rows: 0, replay_rows: 0, request_count: 2, sequence_count: 2,
  owned_requests: [{ request_id: "request-1", reply, submission_event_id: "event-1", sequence_id: 0, incarnation: 1, request_issue_index: 1, rows: [], prefill_rows: 3, decode_rows: 0, verify_rows: 0, replay_rows: 0 }],
};
const batch = { scheduling: { min_batch_rows: 1, max_issue_rows: 10 }, observation_id: "session:1:11", load_generation: 7, session_id: "session", logical_ordinal: 1, logical_rows: 4, physical_batches: [physical], mixed_physical_batches: 1, stage_ms: 9, idle_ms: 3, idle_gated: 2, ready_rows: 6, ready_sequences: 2 };
const span = { load_generation: 7, session_id: "session", execution_ids: [11], executions: [{ execution_id: 11, owned_requests: [{ request_id: "request-1", reply, sequence_id: 0, incarnation: 1 }] }], rows: 4, ingress_unix_ms: 100, start_unix_ms: 102, end_unix_ms: 111, forward_unix_ms: 113 };
const withoutReply = <T extends { reply: unknown }>({ reply: _reply, ...rest }: T) => rest;

describe("P4 inference telemetry wire", () => {
  it("names the exact current v5 content types", () => {
    expect(P4_BATCH_OBSERVATION_CONTENT_TYPE).toBe("application/vnd.p4.llamacpp.batch-observation-v5+json");
    expect(P4_STAGE_SPAN_CONTENT_TYPE).toBe("application/vnd.p4.llamacpp.stage-span-v5+json");
  });

  it("classifies only exact v5 telemetry as current and reports other versions as unsupported", () => {
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.batch-observation-v5+json")).toBe("batch-observation");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.stage-span-v5+json")).toBe("stage-span");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.batch-observation-v4+json")).toBe("unsupported");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.stage-span-v4+json")).toBe("unsupported");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.batch-observation-v6+json")).toBe("unsupported");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.batch-observation-v5")).toBe("unsupported");
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.output-v5+json")).toBeNull();
    expect(classifyP4Telemetry("application/vnd.p4.llamacpp.physical-batch-v5")).toBeNull();
  });

  it("parses the current batch-observation-v5 payload including pacing and request return context", () => {
    const value = parseP4BatchObservation(batch);
    expect(value.physical_batches[0]?.owned_requests[0]).toMatchObject({ request_id: "request-1", prefill_rows: 3, reply });
    expect(value).toMatchObject({ stage_ms: 9, idle_ms: 3, idle_gated: 2, ready_rows: 6, ready_sequences: 2 });
  });

  it("keeps the execution issue cap and accepts absent, null or zero (no issue limit) scheduling", () => {
    expect(parseP4BatchObservation(batch).scheduling?.max_issue_rows).toBe(10);
    const { scheduling: _scheduling, ...older } = batch;
    expect(parseP4BatchObservation(older).scheduling).toBeUndefined();
    expect(parseP4BatchObservation({ ...batch, scheduling: null }).scheduling).toBeNull();
    expect(parseP4BatchObservation({ ...batch, scheduling: { max_issue_rows: 0 } }).scheduling?.max_issue_rows).toBe(0);
  });

  it("rejects a scheduling snapshot whose usize issue cap is missing or not a bounded non-negative integer", () => {
    for (const scheduling of [{ min_batch_rows: 1 }, { max_issue_rows: -1 }, { max_issue_rows: 1.5 }, { max_issue_rows: "10" }, { max_issue_rows: null }, { max_issue_rows: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(() => parseP4BatchObservation({ ...batch, scheduling })).toThrow();
    }
  });

  it("rejects invented or legacy batch fields", () => {
    expect(() => parseP4BatchObservation({ ...batch, physical_batches: [{ ...physical, requests: physical.owned_requests }] })).toThrow();
  });

  it("rejects a v4-shaped batch payload whose owned requests carry no v5 return context", () => {
    const v4 = { ...batch, physical_batches: [{ ...physical, owned_requests: physical.owned_requests.map(withoutReply) }] };
    expect(() => parseP4BatchObservation(v4)).toThrow();
  });

  it("rejects malformed or extended return context in a batch", () => {
    const owned = (patch: object) => ({ ...batch, physical_batches: [{ ...physical, owned_requests: [{ ...physical.owned_requests[0]!, reply: { ...reply, ...patch } }] }] });
    expect(() => parseP4BatchObservation(owned({ channel: "" }))).toThrow();
    expect(() => parseP4BatchObservation(owned({ connection_generation: -1 }))).toThrow();
    expect(() => parseP4BatchObservation(owned({ invented: true }))).toThrow();
  });

  it("parses the current stage-span-v5 payload", () => {
    const value = parseP4StageSpan(span);
    expect(value.execution_ids).toEqual([11]);
    expect(value.executions[0]?.owned_requests[0]).toMatchObject({ request_id: "request-1", reply });
    expect(value.forward_unix_ms - value.ingress_unix_ms).toBe(13);
  });

  it("rejects a v4-shaped stage span whose owned requests carry no v5 return context", () => {
    expect(() => parseP4StageSpan({ ...span, executions: [{ execution_id: 11, owned_requests: span.executions[0]!.owned_requests.map(withoutReply) }] })).toThrow();
  });

  it("rejects malformed return context in a stage span", () => {
    expect(() => parseP4StageSpan({ ...span, executions: [{ execution_id: 11, owned_requests: [{ ...span.executions[0]!.owned_requests[0]!, reply: { ...reply, correlation_id: "" } }] }] })).toThrow();
  });
});
