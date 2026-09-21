import { z } from "zod";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().min(1).max(4096);

// P4 llamacpp adapter v2/mod.rs BATCH_OBSERVATION_CONTENT_TYPE / STAGE_SPAN_CONTENT_TYPE.
export const P4_BATCH_OBSERVATION_CONTENT_TYPE = "application/vnd.p4.llamacpp.batch-observation-v5+json";
export const P4_STAGE_SPAN_CONTENT_TYPE = "application/vnd.p4.llamacpp.stage-span-v5+json";
const TELEMETRY_FAMILY = /^application\/vnd\.p4\.llamacpp\.(?:batch-observation|stage-span)-/;

/** Exact current contracts only; another version of a telemetry family is "unsupported", never current. */
export function classifyP4Telemetry(contentType: string): "batch-observation" | "stage-span" | "unsupported" | null {
  if (contentType === P4_BATCH_OBSERVATION_CONTENT_TYPE) return "batch-observation";
  if (contentType === P4_STAGE_SPAN_CONTENT_TYPE) return "stage-span";
  return TELEMETRY_FAMILY.test(contentType) ? "unsupported" : null;
}

// P4 commands.rs ReplySpec: the exact return context of one request member (deny_unknown_fields).
const replySchema = z.object({
  ingress_agent: identifier,
  channel: identifier,
  connection_generation: nonNegative,
  correlation_id: identifier,
  deadline_unix_ms: nonNegative.nullable().optional(),
}).strict();

const ownedRequestSchema = z.object({
  request_id: identifier,
  reply: replySchema,
  submission_event_id: identifier,
  sequence_id: nonNegative,
  incarnation: nonNegative,
  request_issue_index: nonNegative,
  rows: z.array(z.unknown()),
  prefill_rows: nonNegative,
  decode_rows: nonNegative,
  verify_rows: nonNegative,
  replay_rows: nonNegative,
}).strict();

const physicalBatchSchema = z.object({
  execution_id: nonNegative,
  rows: nonNegative,
  prefill_rows: nonNegative,
  decode_rows: nonNegative,
  verify_rows: nonNegative,
  replay_rows: nonNegative,
  request_count: nonNegative,
  sequence_count: nonNegative,
  owned_requests: z.array(ownedRequestSchema),
}).strict();

// P4 commands.rs SchedulingSnapshot (not deny_unknown_fields): only the selection-time issue cap is read.
// max_issue_rows is a required usize; 0 means "no issue-row limit", so it is valid but names no capacity.
const schedulingSchema = z.object({ max_issue_rows: nonNegative }).passthrough();

export const p4BatchObservationSchema = z.object({
  scheduling: schedulingSchema.nullable().optional(),
  observation_id: identifier,
  load_generation: nonNegative,
  session_id: identifier,
  logical_ordinal: nonNegative,
  logical_rows: nonNegative,
  physical_batches: z.array(physicalBatchSchema),
  mixed_physical_batches: nonNegative,
  stage_ms: nonNegative.default(0),
  idle_ms: nonNegative.default(0),
  idle_gated: nonNegative.default(0),
  ready_rows: nonNegative.default(0),
  ready_sequences: nonNegative.default(0),
}).strict();
export type P4BatchObservation = z.infer<typeof p4BatchObservationSchema>;

const stageExecutionSchema = z.object({
  execution_id: nonNegative,
  owned_requests: z.array(z.object({
    request_id: identifier,
    reply: replySchema,
    sequence_id: nonNegative,
    incarnation: nonNegative,
  }).strict()),
}).strict();

export const p4StageSpanSchema = z.object({
  load_generation: nonNegative,
  session_id: identifier,
  execution_ids: z.array(nonNegative),
  executions: z.array(stageExecutionSchema),
  rows: nonNegative,
  ingress_unix_ms: nonNegative,
  start_unix_ms: nonNegative,
  end_unix_ms: nonNegative,
  forward_unix_ms: nonNegative,
}).strict();
export type P4StageSpan = z.infer<typeof p4StageSpanSchema>;

export const parseP4BatchObservation = (value: unknown): P4BatchObservation => p4BatchObservationSchema.parse(value);
export const parseP4StageSpan = (value: unknown): P4StageSpan => p4StageSpanSchema.parse(value);
