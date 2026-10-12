import { expect, it } from "vitest";
import { classifyP4Telemetry, parseInferenceRun, parseP4SpeculativeRound, P4_SPECULATIVE_ROUND_CONTENT_TYPE } from "../../../../common/protocol/inference/index.js";
import { recordSpeculativeRound, speculativeAcceptance, SPECULATIVE_POINT_LIMIT } from "./index.js";

const run = () => parseInferenceRun({ id: "run", modelId: "model", modelName: "Model", state: "running", submitted: 2, completed: 0,
  createdAt: "2026-10-11T00:00:00Z", error: null, loadGeneration: 42,
  requests: ["one", "two"].map(id => ({ id, state: "queued", prompt: "p", text: "", receivedTokens: 0, prefillTps: null, generationTps: null,
    ttftMs: null, finalTps: null, submittedAt: "2026-10-11T00:00:00Z", completedAt: null, error: null })) });
const round = (changes = {}) => parseP4SpeculativeRound({ observation_id: "first", load_generation: 42, session_id: "run", request_id: "one",
  reply: { ingress_agent: "tcp://head:52000", channel: "outer", connection_generation: 1, correlation_id: "operation", deadline_unix_ms: null },
  sequence_id: 0, incarnation: 3, position: 100, drafted: 3, accepted: 2, path: "direct", emitted_tokens: 1, ...changes });

it("uses a separate versioned strict contract and rejects impossible counts", () => {
  expect(classifyP4Telemetry(P4_SPECULATIVE_ROUND_CONTENT_TYPE)).toBe("speculative-round");
  expect(classifyP4Telemetry(P4_SPECULATIVE_ROUND_CONTENT_TYPE.replace("v1", "v2"))).toBe("unsupported");
  for (const changes of [{ accepted: 4 }, { drafted: -1 }, { accepted: .5 }, { position: Number.MAX_SAFE_INTEGER + 1 }, { path: "checkpoint" }, { unexpected: 1 }]) expect(() => round(changes)).toThrow();
});
it("uses weighted totals across requests, retains EOS decision counts and buckets by reception time", () => {
  const value = run(); recordSpeculativeRound(value, round(), 1200);
  recordSpeculativeRound(value, round({ observation_id: "second", request_id: "two", drafted: 1, accepted: 1, path: "full" }), 1800);
  expect(value.speculative).toMatchObject({ rounds: 2, drafted: 4, accepted: 3, emittedTokens: 2, full: 1, direct: 1, draftedMin: 1, draftedMax: 3 });
  expect(speculativeAcceptance(value.speculative)).toBe(.75);
  expect(speculativeAcceptance(value.requests[0]!.speculative)).toBe(2 / 3);
  expect(speculativeAcceptance(value.requests[1]!.speculative)).toBe(1);
  expect(value.speculative!.points).toHaveLength(1);
  expect(value.speculative!.points[0]).toMatchObject({ atUnixMs: 1000, drafted: 4, accepted: 3 });
});
it("does not infer acceptance from replay path or emitted output; zero-draft replay leaves rate unchanged", () => {
  const value = run(); recordSpeculativeRound(value, round({ path: "replay" }), 1000);
  recordSpeculativeRound(value, round({ observation_id: "replay-only", drafted: 0, accepted: 0, emitted_tokens: 3, path: "replay" }), 2000);
  expect(value.speculative).toMatchObject({ drafted: 3, accepted: 2, replay: 2, emittedTokens: 4 });
  expect(speculativeAcceptance(value.speculative)).toBe(2 / 3);
  expect(value.speculative!.points[1]!.drafted).toBe(0);
});
it("deduplicates observations and accepts delayed positions without losing earlier rounds", () => {
  const value = run(); recordSpeculativeRound(value, round(), 1000);
  expect(recordSpeculativeRound(value, round(), 2000)).toBe(false);
  expect(() => recordSpeculativeRound(value, round({ accepted: 1 }), 2000)).toThrow(/conflicting/);
  recordSpeculativeRound(value, round({ observation_id: "earlier", position: 96 }), 2000);
  expect(value.speculative!.rounds).toBe(2);
});
it("rejects unrelated load/session/request without adding metrics", () => {
  for (const changes of [{ session_id: "old" }, { load_generation: 41 }, { request_id: "unknown" }]) {
    const value = run(); expect(() => recordSpeculativeRound(value, round(changes), 1000)).toThrow(); expect(value.speculative).toBeUndefined();
  }
});
it("preserves totals beyond the chart window and reloads both run and request histories", () => {
  const value = run();
  for (let i = 0; i < SPECULATIVE_POINT_LIMIT + 1; i++) recordSpeculativeRound(value, round({ observation_id: `${i}` }), i * 1000);
  expect(value.speculative).toMatchObject({ rounds: 3601, drafted: 10803, accepted: 7202, discardedPoints: 1 });
  expect(value.speculative!.points).toHaveLength(3600);
  expect(parseInferenceRun(JSON.parse(JSON.stringify(value))).speculative).toEqual(value.speculative);
  expect(parseInferenceRun(JSON.parse(JSON.stringify(value))).requests[0]!.speculative).toEqual(value.requests[0]!.speculative);
});
it("distinguishes missing telemetry from an observed zero acceptance and undefined denominator", () => {
  const value = run(); expect(value.speculative).toBeUndefined(); expect(speculativeAcceptance(value.speculative)).toBeNull();
  recordSpeculativeRound(value, round({ drafted: 0, accepted: 0 }), 1000);
  expect(speculativeAcceptance(value.speculative)).toBeNull();
  recordSpeculativeRound(value, round({ observation_id: "rejected", accepted: 0 }), 2000);
  expect(speculativeAcceptance(value.speculative)).toBe(0);
});
