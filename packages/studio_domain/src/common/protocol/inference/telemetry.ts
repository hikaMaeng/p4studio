import { z } from "zod";

const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().min(1).max(4096);

const ownedRequestSchema = z.object({
  request_id: identifier,
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

export const p4BatchObservationSchema = z.object({
  scheduling: z.unknown().optional(),
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
