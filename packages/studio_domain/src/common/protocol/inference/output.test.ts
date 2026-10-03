import { describe, expect, it } from "vitest";
import { classifyP4Output, OutputOrdinalBuffer, parseP4ApprovedOutput, P4_OUTPUT_CONTENT_TYPE, type P4ApprovedOutput } from "./output.js";

// Field set of P4 completion.rs ApprovedOutputWire (output-v6).
const output = (ordinal: number, text: string, stop: string | null = null): P4ApprovedOutput => ({
  load_generation: 7, session_id: "session", request_id: "request", sequence_id: 0, token: 100 + ordinal, text, position: 40 + ordinal,
  stop, submission_event_id: "sent-a", incarnation: 3, output_ordinal: ordinal, release_operation_id: stop === null ? null : 11,
});

describe("P4 OUTPUT v6 contract", () => {
  it("accepts only the exact current content type", () => {
    expect(P4_OUTPUT_CONTENT_TYPE).toBe("application/vnd.p4.llamacpp.output-v6+json");
    expect(classifyP4Output(P4_OUTPUT_CONTENT_TYPE)).toBe("output");
    expect(classifyP4Output("application/vnd.p4.llamacpp.output-v5+json")).toBe("unsupported");
    expect(classifyP4Output("application/vnd.p4.llamacpp.error-v2+json")).toBeNull();
  });

  it("requires the explicit request-local ordinal and rejects unknown fields", () => {
    expect(parseP4ApprovedOutput(output(0, "a")).output_ordinal).toBe(0);
    const { output_ordinal: _ordinal, ...withoutOrdinal } = output(0, "a");
    expect(() => parseP4ApprovedOutput(withoutOrdinal)).toThrow();
    expect(() => parseP4ApprovedOutput({ ...output(0, "a"), extra: 1 })).toThrow();
    expect(parseP4ApprovedOutput({ ...output(1, "b", "eos"), issued_work: { revision: 1 } }).stop).toBe("eos");
  });
});

describe("OUTPUT ordinal buffer", () => {
  it("releases out-of-order arrivals in ordinal order", () => {
    const buffer = new OutputOrdinalBuffer(8);
    expect(buffer.accept(output(2, "c"))).toEqual([]);
    expect(buffer.accept(output(1, "b"))).toEqual([]);
    expect(buffer.heldCount).toBe(2);
    expect(buffer.accept(output(0, "a")).map(value => value.text)).toEqual(["a", "b", "c"]);
    expect(buffer.heldCount).toBe(0);
    expect(buffer.terminated).toBe(false);
    expect(buffer.accept(output(3, "", "eos")).map(value => value.stop)).toEqual(["eos"]);
    expect(buffer.terminated).toBe(true);
  });

  it("ignores an identical repeat of a consumed or held ordinal", () => {
    const buffer = new OutputOrdinalBuffer(8);
    expect(buffer.accept(output(0, "a"))).toHaveLength(1);
    expect(buffer.accept(output(0, "a"))).toEqual([]);
    expect(buffer.accept(output(2, "c"))).toEqual([]);
    expect(buffer.accept(output(2, "c"))).toEqual([]);
    expect(buffer.heldCount).toBe(1);
  });

  it("rejects a different payload for a known ordinal", () => {
    const buffer = new OutputOrdinalBuffer(8);
    buffer.accept(output(0, "a")); buffer.accept(output(2, "c"));
    expect(() => buffer.accept(output(0, "x"))).toThrow("Conflicting");
    expect(() => buffer.accept(output(2, "x"))).toThrow("Conflicting");
  });

  it("rejects ordinals beyond the token budget or around a terminal", () => {
    expect(() => new OutputOrdinalBuffer(2).accept(output(2, "c"))).toThrow("token budget");
    const afterTerminal = new OutputOrdinalBuffer(8);
    afterTerminal.accept(output(1, "", "eos"));
    expect(() => afterTerminal.accept(output(2, "c"))).toThrow("terminal");
    const beforeHeld = new OutputOrdinalBuffer(8);
    beforeHeld.accept(output(3, "d"));
    expect(() => beforeHeld.accept(output(2, "", "eos"))).toThrow("terminal");
  });
});
