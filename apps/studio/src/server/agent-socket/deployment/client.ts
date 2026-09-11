import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { agentDialAddress } from "../routes.js";
import { decodeP4Event, encodeP4Event, MAX_EVENT_BYTES, sameEndpoint, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import { UncertainDelivery, type DeploymentTransport } from "@p4studio/studio_domain/server";

/** One persistent ingress socket. Agents route final targets and return events unchanged. */
export class DeploymentSocket implements DeploymentTransport {
  private socket: Socket;
  private buffer = Buffer.alloc(0);
  private sequence = 0;
  private stopped = false;
  private failure: Error | null = null;
  private pending: { event: P4Event; types: string[]; resolve: (e: P4Event) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  readonly outer: Extract<P4Endpoint, { kind: "outer" }>;
  constructor(host: string, port: number, readonly operationId: string) {
    const address = `tcp://${host.includes(":") ? `[${host}]` : host}:${port}`;
    this.outer = { kind: "outer", address, channel: `studio-${operationId}`, generation: 1 };
    this.socket = connect(agentDialAddress(host, port)); this.socket.setNoDelay(true);
    this.socket.on("data", bytes => this.receive(bytes));
    this.socket.on("error", error => this.fail(new UncertainDelivery(error.message)));
    this.socket.on("close", () => { if (!this.stopped) this.fail(new UncertainDelivery("Ingress connection closed before completion")); });
  }
  exchange(target: P4Endpoint, adapter: string, contentType: string, payload: unknown, terminalTypes: string[], timeoutMs: number): Promise<P4Event> {
    if (this.pending) return Promise.reject(new Error("An exchange is already active"));
    if (this.failure || this.stopped) return Promise.reject(this.failure ?? new UncertainDelivery("Ingress connection is closed"));
    const event: P4Event = { eventId: randomUUID(), correlationId: this.operationId, causationId: null,
      source: this.outer, target, returnRoute: this.outer, class: 0, sequence: ++this.sequence,
      deadline: Date.now() + timeoutMs, adapterKind: adapter, contentType, payload: new TextEncoder().encode(JSON.stringify(payload)) };
    const bytes = encodeP4Event(event); const frame = Buffer.alloc(4 + bytes.length); frame.writeUInt32LE(bytes.length); frame.set(bytes, 4);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new UncertainDelivery("Timed out waiting for a matching node completion; runtime state is unknown")), timeoutMs);
      this.pending = { event, types: terminalTypes, resolve, reject, timer };
      this.socket.write(frame, error => { if (error) this.fail(new UncertainDelivery(error.message)); });
    });
  }
  private receive(bytes: Buffer) {
    try {
      this.buffer = Buffer.concat([this.buffer, bytes]);
      while (this.buffer.length >= 4) {
        const length = this.buffer.readUInt32LE();
        if (!length || length > MAX_EVENT_BYTES) throw new UncertainDelivery("Invalid P4 event frame length");
        if (this.buffer.length < length + 4) return;
        const event = decodeP4Event(this.buffer.subarray(4, length + 4)); this.buffer = this.buffer.subarray(length + 4);
        const pending = this.pending;
        if (!pending || event.correlationId !== this.operationId || event.causationId !== pending.event.eventId) continue;
        const adapterMatches = pending.event.target.kind === "agent" ? event.adapterKind === null : event.adapterKind === pending.event.adapterKind;
        if (!sameEndpoint(event.target, this.outer) || !sameEndpoint(event.source, pending.event.target) || !adapterMatches) throw new UncertainDelivery("P4 completion source, target or adapter mismatch");
        if (!pending.types.includes(event.contentType)) continue;
        clearTimeout(pending.timer); this.pending = null; pending.resolve(event);
      }
    } catch (error) { this.fail(error instanceof UncertainDelivery ? error : new UncertainDelivery(String(error))); }
  }
  private fail(error: Error) { this.failure = error; if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; } this.socket.destroy(); }
  close() { this.stopped = true; if (this.pending) this.fail(new UncertainDelivery("Operation closed")); this.socket.destroy(); }
}
