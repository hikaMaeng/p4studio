import {
  decodeP4Event,
  encodeP4Event,
  frameP4Event,
  P4FrameReader,
  sameEndpoint,
  type P4Endpoint,
  type P4Event,
} from "@p4studio/p4-protocol";
import { P4_TUNNEL_PATH, parseP4TunnelServerControl } from "@p4studio/studio_domain/common";

export class UncertainDelivery extends Error { constructor(message: string) { super(message); this.name = "UncertainP4Delivery"; } }

type Pending = { event: P4Event; terminalTypes: string[]; resolve: (event: P4Event) => void; reject: (error: Error) => void; timer: number };

/** The browser creates P4 events and matches replies; the WebSocket carries bytes only. */
export class BrowserP4Connection {
  private readonly socket: WebSocket;
  private readonly reader = new P4FrameReader();
  private pending: Pending | undefined;
  private opened = false;
  private stopped = false;
  private sequence = 0;
  private readonly listeners = new Set<(event: P4Event) => void>();
  readonly operationId = crypto.randomUUID();
  readonly outer: Extract<P4Endpoint, { kind: "outer" }>;

  private constructor(agentId: string, ingressAddress: string) {
    this.outer = { kind: "outer", address: ingressAddress, channel: `studio-${this.operationId}`, generation: 1 };
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    this.socket = new WebSocket(`${protocol}://${location.host}${P4_TUNNEL_PATH}`);
    this.socket.binaryType = "arraybuffer";
    this.socket.addEventListener("message", event => this.receive(event.data));
    this.socket.addEventListener("close", () => this.fail(new UncertainDelivery("P4 bridge closed before completion")));
    this.socket.addEventListener("error", () => this.fail(new UncertainDelivery("P4 bridge transport failed")));
    this.socket.addEventListener("open", () => this.socket.send(JSON.stringify({ type: "open", connectionId: this.operationId, agentId })));
  }

  static open(agentId: string, ingressAddress: string): Promise<BrowserP4Connection> {
    const connection = new BrowserP4Connection(agentId, ingressAddress);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { connection.close(); reject(new UncertainDelivery("Timed out opening browser P4 bridge")); }, 10_000);
      const listener = (event: MessageEvent) => {
        if (typeof event.data !== "string") return;
        try {
          const control = parseP4TunnelServerControl(JSON.parse(event.data));
          if (control.connectionId !== connection.operationId && control.connectionId !== null) return;
          if (control.type === "opened") { window.clearTimeout(timer); connection.opened = true; connection.socket.removeEventListener("message", listener); resolve(connection); }
          if (control.type === "error" || control.type === "closed") { window.clearTimeout(timer); connection.socket.removeEventListener("message", listener); connection.close(); reject(new UncertainDelivery(control.detail)); }
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

  dispatch(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, eventClass = 0, deadline: number | null = null): P4Event {
    if (!this.opened || this.stopped) throw new UncertainDelivery("P4 bridge is not open");
    const event = this.event(target, adapter, contentType, payload, eventClass, deadline);
    this.send(frameP4Event(encodeP4Event(event))); return event;
  }

  onEvent(listener: (event: P4Event) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  close() {
    this.stopped = true;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "close", connectionId: this.operationId }));
    this.socket.close();
  }

  private receive(data: unknown) {
    if (typeof data === "string") {
      try { const message = parseP4TunnelServerControl(JSON.parse(data)); if (message.type !== "opened") this.fail(new UncertainDelivery(message.detail)); } catch { /* invalid text does not alter P4 byte state */ }
      return;
    }
    try {
      if (!(data instanceof ArrayBuffer)) throw new Error("P4 bridge delivered a non-binary WebSocket message");
      const bytes = new Uint8Array(data);
      for (const frame of this.reader.push(bytes)) this.match(decodeP4Event(frame));
    } catch (error) { this.fail(new UncertainDelivery(error instanceof Error ? error.message : String(error))); }
  }

  private match(event: P4Event) {
    this.listeners.forEach(listener => listener(event));
    const pending = this.pending;
    if (!pending || event.correlationId !== this.operationId || event.causationId !== pending.event.eventId) return;
    const adapterMatches = pending.event.target.kind === "agent" ? event.adapterKind === null : event.adapterKind === pending.event.adapterKind;
    if (!sameEndpoint(event.target, this.outer) || !sameEndpoint(event.source, pending.event.target) || !adapterMatches) {
      this.fail(new UncertainDelivery("P4 completion endpoint or adapter identity mismatch")); return;
    }
    if (!pending.terminalTypes.includes(event.contentType)) return;
    window.clearTimeout(pending.timer); this.pending = undefined; pending.resolve(event);
  }

  private event(target: P4Endpoint, adapter: string | null, contentType: string, payload: unknown, eventClass: number, deadline: number | null): P4Event {
    return { eventId: crypto.randomUUID(), correlationId: this.operationId, causationId: null, source: this.outer, target, returnRoute: this.outer,
      class: eventClass, sequence: ++this.sequence, deadline, adapterKind: adapter, contentType, payload: new TextEncoder().encode(JSON.stringify(payload)) };
  }

  private send(bytes: Uint8Array) {
    const exact = new Uint8Array(bytes.byteLength); exact.set(bytes); this.socket.send(exact.buffer);
  }

  private fail(error: Error) {
    if (this.stopped) return;
    this.stopped = true;
    const pending = this.pending; this.pending = undefined;
    if (pending) { window.clearTimeout(pending.timer); pending.reject(error); }
    this.socket.close();
  }
}
