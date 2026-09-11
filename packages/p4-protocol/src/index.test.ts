import { describe, expect, it } from "vitest";
import { P4_AGENT_OPERATIONS, P4_PROTOCOL, P4FrameReader, frameP4Event } from "./index.js";

describe("P4 public boundary", () => {
  it("pins the currently audited wire versions", () => {
    expect(P4_PROTOCOL).toEqual({ frameVersion: 8, eventVersion: 3, statusSchemaVersion: 6 });
  });

  it("does not expose inference relay as a studio operation", () => {
    expect(P4_AGENT_OPERATIONS).not.toContain("relay-inference");
  });

  it("preserves P4 length framing across arbitrary transport chunks", () => {
    const first = frameP4Event(new Uint8Array([1, 2, 3]));
    const second = frameP4Event(new Uint8Array([4, 5]));
    const all = new Uint8Array(first.byteLength + second.byteLength); all.set(first); all.set(second, first.byteLength);
    const reader = new P4FrameReader();
    expect(reader.push(all.slice(0, 2))).toEqual([]);
    expect(reader.push(all.slice(2, 8))).toEqual([new Uint8Array([1, 2, 3])]);
    expect(reader.push(all.slice(8))).toEqual([new Uint8Array([4, 5])]);
  });
});
