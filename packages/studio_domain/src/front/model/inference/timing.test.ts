import { describe, expect, it } from "vitest";
import type { InferenceRequest } from "../../../common/protocol/inference/index.js";
import { invalidateLegacyDispatchTiming, migrateLegacyTiming, recordOutputTiming, type RequestTiming } from "./timing.js";
import { emptyRequestTelemetry } from "./observability.js";

const request = (): InferenceRequest => ({ id: "request", state: "streaming", prompt: "prompt", text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, waveIndex: 1, submittedAt: "", completedAt: null, error: null, telemetry: emptyRequestTelemetry() });
const timing = (): RequestTiming => ({ sentAtMs: 10.25, firstOutputAtMs: null, prefillRows: 20 });

describe("TTFT-based client TPS", () => {
  it("keeps generation rate independent of request waiting time", () => {
    for (const ttft of [100, 10000]) {
      const item = request(); const clock = timing();
      recordOutputTiming(item, clock, clock.sentAtMs + ttft, false);
      expect(item.ttftMs).toBe(ttft);
      expect(item.generationTps).toBeNull();
      expect(item.finalTps).toBeNull();
      recordOutputTiming(item, clock, clock.sentAtMs + ttft + 50, false);
      expect(item.generationTps).toBe(20);
      expect(item.finalTps).toBeNull();
      recordOutputTiming(item, clock, clock.sentAtMs + ttft + 100, true);
      expect(item.receivedTokens).toBe(3);
      expect(item.generationTps).toBe(20);
      expect(item.finalTps).toBe(20);
    }
  });

  it("does not invent a rate for one token or outputs received together", () => {
    const item = request(); const clock = timing();
    recordOutputTiming(item, clock, 30.25, true);
    expect(item.finalTps).toBeNull();
    recordOutputTiming(item, clock, 30.25, true);
    expect(item.finalTps).toBeNull();
  });

  it("isolates interleaved requests and retains fractional timing precision", () => {
    const a = request(); const b = request(); const aClock = timing(); const bClock = { ...timing(), sentAtMs: 100.25 };
    recordOutputTiming(a, aClock, 110.5, false);
    recordOutputTiming(b, bClock, 115.75, false);
    recordOutputTiming(a, aClock, 123, true);
    recordOutputTiming(b, bClock, 140.75, true);
    expect(a.finalTps).toBe(80);
    expect(b.finalTps).toBe(40);
    expect(a.ttftMs).toBe(100);
    expect(b.ttftMs).toBe(16);
  });

  it("counts an empty-text sampled terminal token like other output-v5 tokens", () => {
    const item = request(); const clock = timing();
    recordOutputTiming(item, clock, 100, false);
    recordOutputTiming(item, clock, 200, true);
    expect(item.text).toBe("");
    expect(item.receivedTokens).toBe(2);
    expect(item.finalTps).toBe(10);
  });

  it("converts v1 history from its first-to-last rate, not end-to-end TPS", () => {
    const item = request(); Object.assign(item, { state: "completed", receivedTokens: 3, generationTps: 30, finalTps: 0.3, ttftMs: 9900, text: "saved response" });
    migrateLegacyTiming(item);
    expect(item).toMatchObject({ generationTps: 20, finalTps: 20, ttftMs: 9900, text: "saved response" });
    const incomplete = request(); Object.assign(incomplete, { receivedTokens: 2, generationTps: 20, finalTps: 1 });
    migrateLegacyTiming(incomplete);
    expect(incomplete.finalTps).toBeNull();
    const single = request(); Object.assign(single, { state: "completed", receivedTokens: 1, finalTps: 1 });
    migrateLegacyTiming(single);
    expect(single.finalTps).toBeNull();
  });

  it("invalidates TTFT captured before send-time timing without changing generation TPS", () => {
    const item = request(); Object.assign(item, { ttftMs: 9000, prefillTps: 12, generationTps: 20, finalTps: 20 });
    invalidateLegacyDispatchTiming(item);
    expect(item).toMatchObject({ ttftMs: null, prefillTps: null, generationTps: 20, finalTps: 20, waveIndex: null });
  });
});
