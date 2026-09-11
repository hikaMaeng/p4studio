// P4 authority: layers/protocol/src/event/wire.rs (event-v3, not legacy frame-v8).
export type P4Endpoint =
  | { kind: "agent"; address: string }
  | { kind: "node"; address: string; nodeId: string; generation: number }
  | { kind: "outer"; address: string; channel: string; generation: number };
export type P4Event = {
  eventId: string; correlationId: string; causationId: string | null;
  source: P4Endpoint; target: P4Endpoint; returnRoute: Extract<P4Endpoint, { kind: "outer" }> | null;
  class: number; sequence: number; deadline: number | null; adapterKind: string | null;
  contentType: string; payload: Uint8Array;
};
export const MAX_EVENT_BYTES = 8 * 1024 * 1024;

/** Frames one encoded P4 event for its TCP transport. */
export function frameP4Event(event: Uint8Array): Uint8Array {
  if (event.byteLength === 0 || event.byteLength > MAX_EVENT_BYTES) throw new Error("Invalid P4 event frame size");
  const frame = new Uint8Array(event.byteLength + 4);
  new DataView(frame.buffer).setUint32(0, event.byteLength, true);
  frame.set(event, 4);
  return frame;
}

/** Accumulates arbitrary transport chunks into complete encoded P4 events. */
export class P4FrameReader {
  private buffered = new Uint8Array();

  push(chunk: Uint8Array): Uint8Array[] {
    const combined = new Uint8Array(this.buffered.byteLength + chunk.byteLength);
    combined.set(this.buffered); combined.set(chunk, this.buffered.byteLength);
    const events: Uint8Array[] = [];
    let offset = 0;
    while (combined.byteLength - offset >= 4) {
      const size = new DataView(combined.buffer, combined.byteOffset + offset, 4).getUint32(0, true);
      if (size === 0 || size > MAX_EVENT_BYTES) throw new Error("Invalid P4 event frame size");
      if (combined.byteLength - offset < size + 4) break;
      events.push(combined.slice(offset + 4, offset + size + 4));
      offset += size + 4;
    }
    this.buffered = combined.slice(offset);
    return events;
  }
}
class Writer {
  chunks: Uint8Array[] = [];
  raw(value: Uint8Array) { this.chunks.push(value); }
  number(value: number, size: number) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid wire integer");
    const bytes = new Uint8Array(size); let n = BigInt(value);
    for (let i = 0; i < size; i++) { bytes[i] = Number(n & 255n); n >>= 8n; }
    if (n) throw new Error("Wire integer overflow");
    this.raw(bytes);
  }
  text(value: string) { const bytes = new TextEncoder().encode(value); if (bytes.length > 262144) throw new Error("Wire text too large"); this.number(bytes.length, 4); this.raw(bytes); }
  optional<T>(value: T | null, write: (v: T) => void) { this.number(value === null ? 0 : 1, 1); if (value !== null) write(value); }
  outer(value: Extract<P4Endpoint, { kind: "outer" }>) { this.text(value.address); this.text(value.channel); this.number(value.generation, 8); }
  endpoint(value: P4Endpoint) {
    this.number(value.kind === "agent" ? 0 : value.kind === "node" ? 1 : 2, 1);
    if (value.kind === "outer") this.outer(value);
    else { this.text(value.address); if (value.kind === "node") { this.text(value.nodeId); this.number(value.generation, 8); } }
  }
  finish() { const bytes = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0)); let offset = 0; for (const c of this.chunks) { bytes.set(c, offset); offset += c.length; } return bytes; }
}
class Reader {
  offset = 0;
  constructor(readonly bytes: Uint8Array) {}
  raw(n: number) { if (n < 0 || this.offset + n > this.bytes.length) throw new Error("Truncated P4 event"); const b = this.bytes.subarray(this.offset, this.offset + n); this.offset += n; return b; }
  number(size: number) { const b = this.raw(size); let n = 0n; for (let i = size - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]!); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsafe P4 integer"); return Number(n); }
  text() { const n = this.number(4); if (n > 262144) throw new Error("Wire text too large"); return new TextDecoder("utf-8", { fatal: true }).decode(this.raw(n)); }
  optional<T>(read: () => T): T | null { const tag = this.number(1); if (tag === 0) return null; if (tag !== 1) throw new Error("Invalid optional tag"); return read(); }
  outer(): Extract<P4Endpoint, { kind: "outer" }> { return { kind: "outer", address: this.text(), channel: this.text(), generation: this.number(8) }; }
  endpoint(): P4Endpoint { const tag = this.number(1); if (tag === 0) return { kind: "agent", address: this.text() }; if (tag === 1) return { kind: "node", address: this.text(), nodeId: this.text(), generation: this.number(8) }; if (tag === 2) return this.outer(); throw new Error("Invalid endpoint tag"); }
  done() { if (this.offset !== this.bytes.length) throw new Error("Trailing P4 event bytes"); }
}
export function encodeP4Event(event: P4Event): Uint8Array {
  const e = new Writer(); e.number(3, 2); e.text(event.eventId); e.text(event.correlationId);
  e.optional(event.causationId, v => e.text(v)); e.endpoint(event.source); e.endpoint(event.target);
  e.optional(event.returnRoute, v => e.outer(v)); e.number(event.class, 1); e.number(event.sequence, 8);
  e.optional(event.deadline, v => e.number(v, 8)); e.optional(event.adapterKind, v => e.text(v)); e.text(event.contentType);
  const envelope = e.finish(); const w = new Writer(); w.raw(new TextEncoder().encode("P4E3")); w.number(envelope.length, 4); w.number(event.payload.length, 4); w.raw(envelope); w.raw(event.payload);
  const result = w.finish(); if (result.length > MAX_EVENT_BYTES) throw new Error("P4 event exceeds Studio limit"); return result;
}
export function decodeP4Event(bytes: Uint8Array): P4Event {
  if (bytes.length > MAX_EVENT_BYTES) throw new Error("P4 event exceeds Studio limit");
  const r = new Reader(bytes); if (new TextDecoder().decode(r.raw(4)) !== "P4E3") throw new Error("Invalid P4 event magic");
  const el = r.number(4), pl = r.number(4); if (el > 262144) throw new Error("P4 envelope too large");
  const e = new Reader(r.raw(el)); const payload = r.raw(pl); r.done();
  if (e.number(2) !== 3) throw new Error("Unsupported P4 event version");
  const result: P4Event = { eventId: e.text(), correlationId: e.text(), causationId: e.optional(() => e.text()), source: e.endpoint(), target: e.endpoint(), returnRoute: e.optional(() => e.outer()), class: e.number(1), sequence: e.number(8), deadline: e.optional(() => e.number(8)), adapterKind: e.optional(() => e.text()), contentType: e.text(), payload };
  e.done(); if (result.class > 3) throw new Error("Invalid P4 event class"); return result;
}
export function sameEndpoint(a: P4Endpoint, b: P4Endpoint): boolean {
  return a.kind === b.kind && a.address === b.address && (a.kind !== "node" || (b.kind === "node" && a.nodeId === b.nodeId && a.generation === b.generation)) && (a.kind !== "outer" || (b.kind === "outer" && a.channel === b.channel && a.generation === b.generation));
}
