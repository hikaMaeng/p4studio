import { z } from "zod";

// P4 llamacpp adapter v2/mod.rs OUTPUT_CONTENT_TYPE and completion.rs ApprovedOutputWire.
export const P4_OUTPUT_CONTENT_TYPE = "application/vnd.p4.llamacpp.output-v6+json";
const OUTPUT_FAMILY = /^application\/vnd\.p4\.llamacpp\.output-/;

/** Exact current contract only; another OUTPUT version is "unsupported", never current. */
export function classifyP4Output(contentType: string): "output" | "unsupported" | null {
  if (contentType === P4_OUTPUT_CONTENT_TYPE) return "output";
  return OUTPUT_FAMILY.test(contentType) ? "unsupported" : null;
}

const u32 = z.number().int().min(0).max(0xffff_ffff);
const u64 = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().min(1).max(4096);

// The wire DTO is deny_unknown_fields. `issued_work` is the head's sealed
// issue history; Studio keeps it opaque and never judges it.
export const p4ApprovedOutputSchema = z.object({
  load_generation: u64,
  session_id: identifier,
  request_id: identifier,
  sequence_id: u32,
  token: z.number().int(),
  text: z.string(),
  position: u32,
  stop: z.string().nullable(),
  submission_event_id: identifier,
  incarnation: u64,
  output_ordinal: u32,
  release_operation_id: u64.nullable(),
  issued_work: z.unknown().optional(),
}).strict();
export type P4ApprovedOutput = z.infer<typeof p4ApprovedOutputSchema>;
export const parseP4ApprovedOutput = (value: unknown): P4ApprovedOutput => p4ApprovedOutputSchema.parse(value);

const same = (left: P4ApprovedOutput, right: P4ApprovedOutput) =>
  left.token === right.token && left.text === right.text && left.position === right.position && left.stop === right.stop
  && left.sequence_id === right.sequence_id && left.incarnation === right.incarnation && left.submission_event_id === right.submission_event_id;

/**
 * Per-request OUTER ordering of head-approved OUTPUT frames.
 *
 * The P4 broker neither orders nor de-duplicates deliveries, so the request-local
 * `output_ordinal` is the only order. Mirrors tools/event-drive ordinal_buffer.rs:
 * the next ordinal is consumed, a later one is held, an identical repeat is
 * ignored, and a different payload for a known ordinal is a conflict.
 *
 * State: `pending` is keyed by ordinal, scoped to one request of one run, lives
 * until that request's terminal or the run's end, and holds at most
 * `ordinalLimit` entries because every admitted ordinal is below it.
 * `consumed` holds what was already released in order, for repeat comparison.
 */
export class OutputOrdinalBuffer {
  private readonly pending = new Map<number, P4ApprovedOutput>();
  private readonly consumed: P4ApprovedOutput[] = [];
  private terminalOrdinal: number | null = null;

  constructor(private readonly ordinalLimit: number) {
    if (!Number.isSafeInteger(ordinalLimit) || ordinalLimit < 1) throw new Error("OUTPUT ordinal limit must be positive");
  }

  get heldCount(): number { return this.pending.size; }
  get terminated(): boolean { return this.terminalOrdinal !== null && this.consumed.length > this.terminalOrdinal; }

  /** Returns the outputs that became consumable, in ordinal order. Empty for a held or repeated frame. */
  accept(output: P4ApprovedOutput): P4ApprovedOutput[] {
    const ordinal = output.output_ordinal;
    if (ordinal >= this.ordinalLimit) throw new Error("P4 OUTPUT ordinal exceeds the request token budget");
    const known = ordinal < this.consumed.length ? this.consumed[ordinal] : this.pending.get(ordinal);
    if (known) {
      if (same(known, output)) return [];
      throw new Error(`Conflicting P4 OUTPUT payload for ordinal ${ordinal}`);
    }
    const terminal = output.stop !== null;
    if ((this.terminalOrdinal !== null && ordinal > this.terminalOrdinal)
      || (terminal && (this.terminalOrdinal !== null || [...this.pending.keys()].some(held => held > ordinal)))) {
      throw new Error("P4 OUTPUT ordinal follows or precedes an approved terminal");
    }
    if (terminal) this.terminalOrdinal = ordinal;
    this.pending.set(ordinal, output);
    const ready: P4ApprovedOutput[] = [];
    for (let next = this.pending.get(this.consumed.length); next; next = this.pending.get(this.consumed.length)) {
      this.pending.delete(this.consumed.length); this.consumed.push(next); ready.push(next);
    }
    return ready;
  }
}
