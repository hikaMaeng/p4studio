import {
  decodeP4Event,
  encodeP4Event,
  frameP4Event,
  finishP4ConnectionFrame,
  P4FrameReader,
  P4_DELIVERY_FAILURE_CONTENT_TYPE,
  parseP4DeliveryFailure,
  sameEndpoint,
  type P4Endpoint,
  type P4Event,
} from "@p4studio/p4-protocol";
import { P4RequestNotSent, P4_TUNNEL_PATH, parseP4TunnelServerControl } from "@p4studio/studio_domain/common";

export class UncertainDelivery extends Error { constructor(message: string) { super(message); this.name = "UncertainP4Delivery"; } }

// The P4 broker relays a repeated event as often as it arrives, so the OUTER
// drops what it already consumed. Keyed by event ID, scoped to one connection,
// oldest evicted beyond this bound, discarded with the connection.
const SEEN_EVENT_IDS = 65_536;

type Pending = { event: P4Event; terminalTypes: string[]; resolve: (event: P4Event) => void; reject: (error: Error) => void; timer: number };
export type P4DispatchReceipt = { event: P4Event; sentAtMs: number; sentAt: string };

/** The browser creates P4 events and matches replies; the WebSocket carries bytes only. */
export class BrowserP4Connection {
  private readonly socket: WebSocket;
  private readonly reader = new P4FrameReader();
  private pending: Pending | undefined;
  private opened = false;
  private stopped = false;
  private closing: Promise<boolean> | undefined;
  private finishClose: ((acknowledged: boolean) => void) | undefined;
  private sequence = 0;
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<(event: P4Event, receivedAtMs: number) => void>();
  private readonly errors = new Set<(error: Error) => void>();
  readonly operationId: string;
  readonly outer: Extract<P4Endpoint, { kind: "outer" }>;
  get nextSequence() { return this.sequence + 1; }

  private constructor(agentId: string, ingressAddress: string, operationId: string) {
    this.operationId = operationId;
    this.outer = { kind: "outer", address: ingressAddress, channel: `studio-${crypto.randomUUID()}`, generation: 1 };
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    this.socket = new WebSocket(`${protocol}://${location.host}${P4_TUNNEL_PATH}`);
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("message", event => this.receive(event.data, performance.now()));
    this.socket.addEventListener("close", () => { this.finishClose?.(false); this.fail(new UncertainDelivery("P4 bridge closed before completion")); });
    this.socket.addEventListener("error", () => { this.finishClose?.(false); this.fail(new UncertainDelivery("P4 bridge transport failed")); });
    this.socket.addEventListener("open", () => this.socket.send(JSON.stringify({ type: "open", connectionId: this.operationId, agentId })));
  }

  static open(agentId: string, ingressAddress: string, operationId: string = crypto.randomUUID()): Promise<BrowserP4Connection> {
    const connection = new BrowserP4Connection(agentId, ingressAddress, operationId);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { connection.close(); reject(new P4RequestNotSent("Timed out opening browser P4 bridge")); }, 10_000);
      const listener = (event: MessageEvent) => {
        if (typeof event.data !== "string") return;
        try {
          const control = parseP4TunnelServerControl(JSON.parse(event.data));
          if (control.connectionId !== connection.operationId && control.connectionId !== null) return;
          if (control.type === "opened") { window.clearTimeout(timer); connection.opened = true; connection.socket.removeEventListener("message", listener); resolve(connection); }
          if (control.type === "error" || control.type === "closed") { window.clearTimeout(timer); connection.socket.removeEventListener("message", listener); connection.close(); reject(new P4RequestNotSent(control.detail)); }
        } catch { /* Regular P4 binary traffic is handled by receive. */ }
      };
      connection.socket.addEventListener("message", listener);
    });
  }

  exchange(target: P4Endpoint, adapter: string | null, contentType: string, payload: unknown, terminalTypes: string[], timeoutMs: number): Promise<P4Event> {
    if (!this.opened || this.stopped) return Promise.reject(new UncertainDelivery("P4 bridge is not open"));
    if (this.pending) return Promise.reject(new Error("An exchange is already active"));
    const event = this.event(target, adapter, contentType, payload, 0, Date.now() + timeoutMs);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => this.fail(new UncertainDelivery("Timed out waiting for a matching P4 completion; state is unknown")), timeoutMs);
      this.pending = { event, terminalTypes, resolve, reject, timer };
      try { this.send(frameP4Event(encodeP4Event(event))); }
      catch (error) { this.fail(new UncertainDelivery(error instanceof Error ? error.message : String(error))); }
    });
  }

  dispatch(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, eventClass = 0, deadline: number | null = null): P4DispatchReceipt {
    if (!this.opened || this.stopped) throw new UncertainDelivery("P4 bridge is not open");
    const event = this.event(target, adapter, contentType, payload, eventClass, deadline);
    const timing = this.send(frameP4Event(encodeP4Event(event))); return { event, ...timing };
  }

  onEvent(listener: (event: P4Event, receivedAtMs: number) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onError(listener: (error: Error) => void): () => void { this.errors.add(listener); return () => this.errors.delete(listener); }

  close(): Promise<boolean> {
    if (this.closing) return this.closing;
    this.stopped = true;
    const pending = this.pending; this.pending = undefined;
    if (pending) { window.clearTimeout(pending.timer); pending.reject(new UncertainDelivery("P4 operation closed before completion")); }
    this.closing = new Promise(resolve => {
      const timer = window.setTimeout(() => this.finishClose?.(false), 30_000);
      this.finishClose = acknowledged => {
        this.finishClose = undefined; window.clearTimeout(timer);
        if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "close", connectionId: this.operationId }));
        this.socket.close(); resolve(acknowledged);
      };
      if (!this.opened || this.socket.readyState !== WebSocket.OPEN) { this.finishClose(false); return; }
      // The browser owns retirement: consume the transport ACK before closing
      // its WebSocket. This acknowledges no model/request/KV settlement.
      try { this.send(finishP4ConnectionFrame()); }
      catch { this.finishClose?.(false); }
    });
    return this.closing;
  }

  private receive(data: unknown, receivedAtMs: number) {
    if (typeof data === "string") {
      try { const message = parseP4TunnelServerControl(JSON.parse(data)); if (message.type !== "opened") { this.finishClose?.(false); this.fail(new UncertainDelivery(message.detail)); } } catch { /* invalid text does not alter P4 byte state */ }
      return;
    }
    try {
      if (!(data instanceof ArrayBuffer)) throw new Error("P4 bridge delivered a non-binary WebSocket message");
      const bytes = new Uint8Array(data);
      for (const frame of this.reader.push(bytes, this.stopped)) {
        if (frame.byteLength === 0) this.finishClose?.(true);
        else if (!this.stopped) this.match(decodeP4Event(frame), receivedAtMs);
      }
    } catch (error) { this.finishClose?.(false); this.fail(new UncertainDelivery(error instanceof Error ? error.message : String(error))); }
  }

  private match(event: P4Event, receivedAtMs: number) {
    if (this.seen.has(event.eventId)) return;
    this.seen.add(event.eventId);
    if (this.seen.size > SEEN_EVENT_IDS) this.seen.delete(this.seen.values().next().value!);
    this.listeners.forEach(listener => listener(event, receivedAtMs));
    if (event.contentType === P4_DELIVERY_FAILURE_CONTENT_TYPE) { this.deliveryFailure(event); return; }
    const pending = this.pending;
    if (!pending || event.correlationId !== this.operationId || event.causationId !== pending.event.eventId) return;
    const adapterMatches = pending.event.target.kind === "agent" ? event.adapterKind === null : event.adapterKind === pending.event.adapterKind;
    if (!sameEndpoint(event.target, this.outer) || !sameEndpoint(event.source, pending.event.target) || !adapterMatches) {
      this.fail(new UncertainDelivery("P4 completion endpoint or adapter identity mismatch")); return;
    }
    if (!pending.terminalTypes.includes(event.contentType)) return;
    window.clearTimeout(pending.timer); this.pending = undefined; pending.resolve(event);
  }

  /** A transport notice settles nothing; it only ends the wait for a reply that cannot come. */
  private deliveryFailure(event: P4Event) {
    const pending = this.pending;
    if (!pending || event.correlationId !== this.operationId || !sameEndpoint(event.target, this.outer)) return;
    let notice;
    try { notice = parseP4DeliveryFailure(event.payload); } catch { return; }
    if (notice.eventId !== pending.event.eventId) return;
    window.clearTimeout(pending.timer); this.pending = undefined;
    pending.reject(notice.result === "not_started"
      ? new P4RequestNotSent("P4 reported that the request was never sent to its target agent")
      : new UncertainDelivery("P4 could not confirm delivery of the request; state is unknown"));
  }

  private event(target: P4Endpoint, adapter: string | null, contentType: string, payload: unknown, eventClass: number, deadline: number | null): P4Event {
    return { eventId: crypto.randomUUID(), correlationId: this.operationId, causationId: null, source: this.outer, target, returnRoute: this.outer,
      class: eventClass, sequence: ++this.sequence, deadline, adapterKind: adapter, contentType, payload: payload instanceof Uint8Array ? payload : new TextEncoder().encode(JSON.stringify(payload)) };
  }

  private send(bytes: Uint8Array) {
    const exact = new Uint8Array(bytes.byteLength); exact.set(bytes);
    const sentAtMs = performance.now(); const sentAt = new Date().toISOString();
    this.socket.send(exact.buffer); return { sentAtMs, sentAt };
  }

  private fail(error: Error) {
    if (this.stopped) return;
    const pending = this.pending; this.pending = undefined;
    if (pending) { window.clearTimeout(pending.timer); pending.reject(error); }
    this.errors.forEach(listener => listener(error));
    void this.close();
  }
}
