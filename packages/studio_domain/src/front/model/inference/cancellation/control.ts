import { sameEndpoint, type P4Event } from "@p4studio/p4-protocol";
import { P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE, P4_SCOPE_CLOSE_CONTENT_TYPE, P4_SCOPE_CLOSED_CONTENT_TYPE, p4InferenceErrorSchema, p4ReleaseReceiptSchema, p4ScopeClosedSchema, type P4ScopeCloseCommand } from "../../../../common/protocol/inference/cancellation.js";
import type { InferenceRun } from "../../../../common/protocol/inference/index.js";
import type { P4ApprovedOutput } from "../../../../common/protocol/inference/output.js";

type Submission = { event: P4Event; incarnation?: number; sequence?: number; operation?: number; terminal: boolean; released: boolean; refused: boolean; held: number };
export const isActiveInference = (run: InferenceRun) => ["preparing", "running", "settling", "cancelling"].includes(run.state);

// See docs/api.md#inference-cancellation. Intent is distinct from terminal and RELEASE.
export class InferenceCancellation {
  readonly signal = new AbortController();
  private readonly submissions = new Map<string, Submission>();
  private scopeClose?: (command: P4ScopeCloseCommand) => P4Event;
  private scopeCloseEvent?: P4Event;
  private scopeCloseState: "closing" | "closed" | "unknown" | undefined;
  private scopeCloseError?: string;
  private closing?: () => void;
  private settlement?: Promise<void>;
  private naturalTimer?: ReturnType<typeof setTimeout>;
  private plannedSubmissions = 0;
  preparationWrite: Promise<unknown> | undefined;
  constructor(readonly run: InferenceRun, private readonly loadGeneration: number, private readonly publish: () => void, private readonly timeoutMs: number) { run.ownershipCheckpoint = { admitted: 0, settled: 0 }; }
  get requested() { return this.signal.signal.aborted; }
  connect(scopeClose: (command: P4ScopeCloseCommand) => P4Event, close: () => void) { this.closing = close; this.scopeClose = scopeClose; }
  get pending() { return this.plannedSubmissions + [...this.submissions].filter(([id, entry]) => !entry.released || entry.held || ["queued", "streaming"].includes(this.run.requests.find(request => request.id === id)?.state ?? "queued")).length; }
  get settled() { return this.pending === 0; }
  private checkpoint() { this.run.pendingSettlement = this.pending; this.run.ownershipCheckpoint!.settled = this.run.ownershipCheckpoint!.admitted - this.pending; }
  private notify() { this.checkpoint(); this.publish(); }
  reserveWave(count: number) { this.plannedSubmissions += count; this.run.ownershipCheckpoint!.admitted += count; this.notify(); }
  abandonUnsentWave() { this.plannedSubmissions = 0; this.notify(); }
  submitted(id: string, event: P4Event) { if (this.plannedSubmissions) this.plannedSubmissions -= 1; else this.run.ownershipCheckpoint!.admitted += 1; this.submissions.set(id, { event, terminal: false, released: false, refused: false, held: 0 }); this.checkpoint(); }
  deliveryFailed(id: string, eventId: string, notStarted: boolean, detail: string) {
    const entry = this.submissions.get(id), request = this.run.requests.find(value => value.id === id);
    if (!entry || !request || entry.event.eventId !== eventId) throw new Error("Delivery diagnostic names another submission");
    if (notStarted) { entry.released = true; entry.terminal = true; request.state = "failed"; request.error = detail; request.completedAt = new Date().toISOString(); }
    this.run.error = detail;
    void this.cancel();
  }
  output(output: P4ApprovedOutput, held: number) {
    const entry = this.submissions.get(output.request_id);
    if (!entry || entry.event.eventId !== output.submission_event_id) throw new Error("OUTPUT names another submission");
    if (entry.incarnation !== undefined && (entry.incarnation !== output.incarnation || entry.sequence !== undefined && entry.sequence !== output.sequence_id)) throw new Error("OUTPUT changed request incarnation");
    if (output.stop !== null && entry.operation !== undefined && entry.operation !== output.release_operation_id) throw new Error("OUTPUT release operation differs from receipt");
    if (entry.terminal && output.stop !== null) throw new Error("Natural OUTPUT conflicts with cancellation terminal");
    if (output.stop !== null) entry.operation = output.release_operation_id ?? undefined;
    entry.incarnation = output.incarnation; entry.sequence = output.sequence_id; entry.held = held;
  }
  finishNatural() {
    if (this.requested || this.run.requests.some(request => ["queued", "streaming"].includes(request.state))) return;
    if (this.settled) {
      clearTimeout(this.naturalTimer); this.run.state = this.run.requests.some(request => request.state === "failed") ? "failed" : "completed";
    } else {
      this.run.state = "settling";
      this.naturalTimer ??= setTimeout(() => this.transportLost("P4 RELEASE settlement was not confirmed before the deadline"), Math.min(this.timeoutMs, 30_000));
    }
    this.notify();
  }
  transportLost(detail: string) {
    clearTimeout(this.naturalTimer); this.signal.abort();
    this.run.error = [this.run.error, detail].filter(Boolean).join("; "); this.run.state = this.run.submitted ? "unknown" : "failed";
    for (const request of this.run.requests) {
      if (["queued", "streaming"].includes(request.state)) { request.state = "unknown"; request.error = detail; }
    }
    this.notify();
  }
  cancel(): Promise<void> {
    if (this.settlement) return this.settlement;
    if (!isActiveInference(this.run) && this.settled) return Promise.resolve();
    clearTimeout(this.naturalTimer); this.signal.abort(); this.run.state = "cancelling"; this.notify();
    if (this.run.submitted > 0) {
      if (!this.scopeClose) {
        this.scopeCloseState = "unknown"; this.scopeCloseError = "The original P4 scope connection is unavailable";
      } else try {
        this.scopeCloseEvent = this.scopeClose({ load_generation: this.loadGeneration, reason: "Studio user stop" });
        this.scopeCloseState = "closing";
        if (this.run.returnScope) this.run.returnScope.state = "closing";
      } catch (error) {
        this.scopeCloseState = "unknown"; this.scopeCloseError = String(error);
      }
    }
    this.settlement = this.settle();
    return this.settlement;
  }
  consume(event: P4Event): boolean {
    if (this.scopeCloseEvent && event.correlationId === this.scopeCloseEvent.correlationId
      && event.causationId === this.scopeCloseEvent.eventId && event.contentType === P4_SCOPE_CLOSED_CONTENT_TYPE) {
      this.validateScopeCloseRoute(event, 0);
      const result = p4ScopeClosedSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(event.payload)));
      if (result.load_generation !== this.loadGeneration || (result.status === "closed") !== result.native_kv_stop_proven) throw new Error("P4 SCOPE_CLOSE result does not prove the exact LOAD scope");
      if (this.scopeCloseState !== "closed" || result.status === "closed") {
        this.scopeCloseState = result.status; if (this.run.returnScope) this.run.returnScope.state = result.status;
      }
      this.notify(); return true;
    }
    if (![P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE].includes(event.contentType)) return false;
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
        if (this.scopeCloseEvent && event.correlationId === this.scopeCloseEvent.correlationId && event.causationId === this.scopeCloseEvent.eventId
          && error.command.input_content_type === P4_SCOPE_CLOSE_CONTENT_TYPE) {
          this.validateScopeCloseRoute(event, 2); this.scopeCloseState = "unknown"; this.scopeCloseError = error.detail;
          if (this.run.returnScope) this.run.returnScope.state = "unknown";
          this.run.error = error.detail; this.notify(); return true;
        }
        return false;
      }
      const owner = "owner" in error ? error.owner : error.submission;
      const entry = this.submissions.get(owner.request_id);
      if (!entry || owner.load_generation !== this.loadGeneration || owner.session_id !== this.run.id) {
        if (!this.requested) return true;
        throw new Error("Stale cancellation response");
      }
      if (!this.requested && (event.correlationId !== entry.event.correlationId || event.causationId !== entry.event.eventId
        || !sameEndpoint(event.source, entry.event.target) || !sameEndpoint(event.target, entry.event.source)
        || !event.returnRoute || !sameEndpoint(event.returnRoute, entry.event.source) || event.class !== 2)) return true;
      this.validateRoute(event, entry, 2);
      if (event.causationId !== entry.event.eventId) throw new Error("Terminal does not name the original PREFILL");
      if ("submission_event_id" in owner) {
        if (owner.submission_event_id !== entry.event.eventId) { if (!this.requested) return true; throw new Error("Refusal names another submission"); }
        // No admitted native/KV work; the exact original PREFILL was refused.
        const cancelEventId = this.scopeCloseEvent?.eventId;
        entry.refused = error.code === "LLAMA_ADAPTER_EVENT_REJECTED"
          && error.detail.startsWith("PREFILL cancelled before admission;cancel_event=")
          && !!cancelEventId && error.detail === `PREFILL cancelled before admission;cancel_event=${cancelEventId}`;
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
      if (!this.requested) { this.run.error = error.detail; void this.cancel(); }
    }
    if (!this.requested && this.run.state === "settling") this.finishNatural();
    this.notify(); return true;
  }
  private validateRoute(event: P4Event, entry: Submission, eventClass: number) {
    if (!sameEndpoint(event.source, entry.event.target) || !sameEndpoint(event.target, entry.event.source)
      || !event.returnRoute || !sameEndpoint(event.returnRoute, entry.event.source) || event.adapterKind !== "llamacpp" || event.class !== eventClass
      || event.correlationId !== entry.event.correlationId) throw new Error("Cancellation response route differs from original PREFILL");
  }
  private validateScopeCloseRoute(event: P4Event, eventClass: number) {
    const request = this.scopeCloseEvent;
    if (!request || !sameEndpoint(event.source, request.target) || !sameEndpoint(event.target, request.source)
      || !event.returnRoute || !sameEndpoint(event.returnRoute, request.source) || event.adapterKind !== "llamacpp"
      || event.class !== eventClass || event.correlationId !== request.correlationId || event.causationId !== request.eventId) {
      throw new Error("SCOPE_CLOSE response route differs from the exact OUTER and head");
    }
  }
  private async settle() {
    const deadline = Date.now() + Math.min(this.timeoutMs, 30_000);
    while (Date.now() < deadline && this.run.state === "cancelling") {
      if (this.settled && (this.run.submitted === 0 || this.scopeCloseState === "closed" || this.scopeCloseState === "unknown")) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    for (const request of this.run.requests) {
      const entry = this.submissions.get(request.id);
      if (["queued", "streaming"].includes(request.state) || entry && (!entry.released || entry.held)) {
        request.state = "unknown"; request.error = [request.error, "P4 cancellation terminal, OUTPUT prefix or RELEASE was not confirmed before the stop deadline"].filter(Boolean).join("; ");
      }
    }
    if (this.run.state === "cancelling") this.run.state = this.run.requests.some(request => request.state === "unknown") || this.run.submitted > 0 && this.scopeCloseState !== "closed"
      ? "unknown" : this.run.requests.some(request => request.state === "failed") ? "failed" : "cancelled";
    if (this.scopeCloseError) this.run.error = [this.run.error, `P4 SCOPE_CLOSE unresolved: ${this.scopeCloseError}`].filter(Boolean).join("; ");
    if (this.run.state === "unknown") this.run.error = [this.run.error, "Further waves stopped; P4 request settlement remains unknown"].filter(Boolean).join("; ");
    this.notify(); this.closing?.();
  }
}
