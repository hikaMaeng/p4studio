import { z } from "zod";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().min(1).max(4096);
export const P4_SPECULATIVE_ROUND_CONTENT_TYPE = "application/vnd.p4.llamacpp.speculative-round-v1+json";

// See docs/api.md#speculative-decoding; independent of batch-observation-v5.
export const p4SpeculativeRoundSchema = z.object({
  observation_id: identifier, load_generation: count, session_id: identifier, request_id: identifier,
  reply: z.object({ ingress_agent: identifier, channel: identifier, connection_generation: count,
    correlation_id: identifier, deadline_unix_ms: count.nullable().optional() }).strict(),
  sequence_id: count, incarnation: count, position: count,
  drafted: count, accepted: count, path: z.enum(["full", "direct", "replay"]), emitted_tokens: count,
}).strict().refine(value => value.accepted <= value.drafted, "Accepted drafts exceed proposed drafts");
export type P4SpeculativeRound = z.infer<typeof p4SpeculativeRoundSchema>;
export const parseP4SpeculativeRound = (value: unknown): P4SpeculativeRound => p4SpeculativeRoundSchema.parse(value);

const totals = { rounds: count, drafted: count, accepted: count, emittedTokens: count, full: count, direct: count, replay: count };
export const inferenceSpeculativeSchema = z.object({
  ...totals,
  draftedMin: count.nullable(), draftedMax: count.nullable(),
  // Arrival-time, one-second windows. Totals survive the bounded chart window.
  points: z.array(z.object({ atUnixMs: count, ...totals })),
  discardedPoints: count,
});
export type InferenceSpeculative = z.infer<typeof inferenceSpeculativeSchema>;
