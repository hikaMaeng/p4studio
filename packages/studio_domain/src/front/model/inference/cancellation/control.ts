import { sameEndpoint, type P4Event } from "@p4studio/p4-protocol";
import { P4_CANCEL_CONTENT_TYPE, P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE, p4CancelCommandSchema, p4InferenceErrorSchema, p4ReleaseReceiptSchema, type P4CancelCommand } from "../../../../common/protocol/inference/cancellation.js";
import type { InferenceRun } from "../../../../common/protocol/inference/index.js";
import type { P4ApprovedOutput } from "../../../../common/protocol/inference/output.js";

type Submission = { event: P4Event; cancelId?: string; incarnation?: number; sequence?: number; operation?: number; terminal: boolean; released: boolean; refused: boolean; held: number };
export const isActiveInference = (run: InferenceRun) => ["preparing", "running", "cancelling"].includes(run.state);

// See docs/api.md#inference-cancellation. Intent is distinct from terminal and RELEASE.
export class InferenceCancellation {
  readonly signal = new AbortController();
  private readonly submissions = new Map<string, Submission>();
  private dispatch?: (command: P4CancelCommand) => P4Event;
  private closing?: () => void;
  private settlement?: Promise<void>;
  preparationWrite: Promise<unknown> | undefined;
  constructor(readonly run: InferenceRun, private readonly loadGeneration: number, private readonly publish: () => void, private readonly timeoutMs: number) {}
  get requested() { return this.signal.signal.aborted; }
  connect(dispatch: (command: P4CancelCommand) => P4Event, close: () => void) { this.dispatch = dispatch; this.closing = close; }
  submitted(id: string, event: P4Event) { this.submissions.set(id, { event, terminal: false, released: false, refused: false, held: 0 }); }
  output(output: P4ApprovedOutput, held: number) {
    const entry = this.submissions.get(output.request_id);
    if (!entry || entry.event.eventId !== output.submission_event_id) throw new Error("OUTPUT names another submission");
    if (entry.incarnation !== undefined && (entry.incarnation !== output.incarnation || entry.sequence !== undefined && entry.sequence !== output.sequence_id)) throw new Error("OUTPUT changed request incarnation");
    if (output.stop !== null && entry.operation !== undefined && entry.operation !== output.release_operation_id) throw new Error("OUTPUT release operation differs from receipt");
    if (entry.terminal && output.stop !== null) throw new Error("Natural OUTPUT conflicts with cancellation terminal");
    if (output.stop !== null) entry.operation = output.release_operation_id ?? undefined;
    entry.incarnation = output.incarnation; entry.sequence = output.sequence_id; entry.held = held;
  }
  cancel(): Promise<void> {
    if (this.settlement) return this.settlement;
    if (!isActiveInference(this.run)) return Promise.resolve();
    this.signal.abort(); this.run.state = "cancelling"; this.publish();
    for (const request of this.run.requests) {
      if (!["queued", "streaming"].includes(request.state)) continue;
      const entry = this.submissions.get(request.id);
      if (!entry || !this.dispatch) { request.state = "unknown"; request.error = "The original P4 submission connection is unavailable"; continue; }
      try {
        const command = p4CancelCommandSchema.parse({ load_generation: this.loadGeneration, session_id: this.run.id, request_id: request.id, submission_event_id: entry.event.eventId, reason: "Studio user stop" });
        entry.cancelId = this.dispatch(command).eventId;
      } catch (error) { request.state = "unknown"; request.error = String(error); }
    }
    this.settlement = this.settle();
    return this.settlement;
  }
  consume(event: P4Event): boolean {
    if (![P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE].includes(event.contentType) || !this.requested && event.contentType === P4_INFERENCE_ERROR_CONTENT_TYPE) return false;
    const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(event.payload));
    if (event.contentType === P4_RELEASE_RECEIPT_CONTENT_TYPE) {
      const receipt = p4ReleaseReceiptSchema.parse(raw);
      if (receipt.load_generation !== this.loadGeneration || receipt.session_id !== this.run.id) throw new Error("Stale RELEASE receipt");
      for (const member of receipt.members) {
        const entry = this.submissions.get(member.request_id);
        if (!entry || entry.event.eventId !== member.submission_event_id) throw new Error("RELEASE names another submission");
        this.validateRoute(event, entry, 3);
        if (entry.incarnation !== undefined && (entry.incarnation !== member.incarnation || entry.sequence !== undefined && entry.sequence !== member.sequence_id)) throw new Error("RELEASE changed request incarnation");
        if (entry.operation !== undefined && entry.operation !== member.operation_id) throw new Error("RELEASE operation changed");
        entry.incarnation = member.incarnation; entry.sequence = member.sequence_id; entry.operation = member.operation_id; entry.released = true;
      }
    } else {
      const error = p4InferenceErrorSchema.parse(raw);
      if ("command" in error) {
        const entry = [...this.submissions.values()].find(value => value.cancelId === event.causationId);
        if (!entry || error.command.input_content_type !== P4_CANCEL_CONTENT_TYPE) return false;
        this.validateRoute(event, entry, 2);
        // A rejection can race a natural completion; it owns no request terminal.
        this.run.error = error.detail; this.publish(); return true;
      }
      const owner = "owner" in error ? error.owner : error.submission;
      const entry = this.submissions.get(owner.request_id);
      if (!entry || owner.load_generation !== this.loadGeneration || owner.session_id !== this.run.id) throw new Error("Stale cancellation response");
      this.validateRoute(event, entry, 2);
      if (event.causationId !== entry.event.eventId) throw new Error("Terminal does not name the original PREFILL");
      if ("submission_event_id" in owner) {
        if (owner.submission_event_id !== entry.event.eventId) throw new Error("Refusal names another submission");
        // No admitted native/KV work; the exact original PREFILL was refused.
        entry.refused = error.code === "LLAMA_ADAPTER_EVENT_REJECTED" && error.detail.startsWith("PREFILL cancelled before admission;cancel_event=") && error.detail === `PREFILL cancelled before admission;cancel_event=${entry.cancelId}`;
        entry.released = true;
      } else {
        if (entry.incarnation !== undefined && entry.incarnation !== owner.incarnation) throw new Error("Terminal changed request incarnation");
        entry.incarnation = owner.incarnation;
        entry.refused = error.code === "LLAMA_REQUEST_CANCELLED";
      }
      entry.terminal = true;
      const request = this.run.requests.find(value => value.id === owner.request_id)!;
      if (request.state === "completed") throw new Error("Error conflicts with natural completion");
      request.state = entry.refused ? "cancelled" : "failed"; request.completedAt = new Date().toISOString(); request.error = error.detail;
    }
    this.publish(); return true;
  }
  private validateRoute(event: P4Event, entry: Submission, eventClass: number) {
    if (!sameEndpoint(event.source, entry.event.target) || !sameEndpoint(event.target, entry.event.source)
      || !event.returnRoute || !sameEndpoint(event.returnRoute, entry.event.source) || event.adapterKind !== "llamacpp" || event.class !== eventClass
      || event.correlationId !== entry.event.correlationId) throw new Error("Cancellation response route differs from original PREFILL");
  }
  private async settle() {
    const deadline = Date.now() + Math.min(this.timeoutMs, 30_000);
    while (Date.now() < deadline && this.run.state === "cancelling") {
      const unsettled = this.run.requests.some(request => {
        const entry = this.submissions.get(request.id);
        return ["queued", "streaming"].includes(request.state) || Boolean(entry?.cancelId && (!entry.released || entry.held));
      });
      if (!unsettled) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    for (const request of this.run.requests) {
      const entry = this.submissions.get(request.id);
      if (["queued", "streaming"].includes(request.state) || entry?.cancelId && (!entry.released || entry.held)) {
        request.state = "unknown"; request.error = [request.error, "P4 cancellation terminal, OUTPUT prefix or RELEASE was not confirmed before the stop deadline"].filter(Boolean).join("; ");
      }
    }
    if (this.run.state === "cancelling") this.run.state = this.run.requests.some(request => request.state === "unknown") ? "unknown" : this.run.requests.some(request => request.state === "failed") ? "failed" : "cancelled";
    if (this.run.state === "unknown") this.run.error = [this.run.error, "Further waves stopped; P4 request settlement remains unknown"].filter(Boolean).join("; ");
    this.publish(); this.closing?.();
  }
}
