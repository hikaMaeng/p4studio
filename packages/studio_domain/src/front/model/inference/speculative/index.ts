import type { InferenceRun, InferenceSpeculative, P4SpeculativeRound } from "../../../../common/protocol/inference/index.js";

export const SPECULATIVE_POINT_LIMIT = 3600;
const observations = new WeakMap<InferenceRun, Map<string, string>>();
const empty = (): InferenceSpeculative => ({ rounds: 0, drafted: 0, accepted: 0, emittedTokens: 0, full: 0, direct: 0, replay: 0, draftedMin: null, draftedMax: null, points: [], discardedPoints: 0 });
export const speculativeAcceptance = (value: Pick<InferenceSpeculative, "drafted" | "accepted"> | undefined) => value?.drafted ? value.accepted / value.drafted : null;

function accumulate(value: InferenceSpeculative, round: P4SpeculativeRound, atUnixMs: number) {
  if (round.drafted > 0) {
    value.draftedMin = Math.min(value.draftedMin ?? round.drafted, round.drafted);
    value.draftedMax = Math.max(value.draftedMax ?? round.drafted, round.drafted);
  }
  // The producer owns whether a replay carries a new decision; never infer counters from path/output rows.
  const delta = { rounds: 1, drafted: round.drafted,
    accepted: round.accepted, emittedTokens: round.emitted_tokens,
    full: Number(round.path === "full"), direct: Number(round.path === "direct"), replay: Number(round.path === "replay") };
  const bucket = Math.floor(atUnixMs / 1000) * 1000;
  let point = value.points.at(-1);
  if (!point || point.atUnixMs !== bucket) {
    point = { atUnixMs: bucket, rounds: 0, drafted: 0, accepted: 0, emittedTokens: 0, full: 0, direct: 0, replay: 0 };
    value.points.push(point);
    if (value.points.length > SPECULATIVE_POINT_LIMIT) { value.points.shift(); value.discardedPoints += 1; }
  }
  for (const key of Object.keys(delta) as (keyof typeof delta)[]) { value[key] += delta[key]; point[key] += delta[key]; }
}

// See docs/api.md#speculative-decoding. Only the head publishes a tail decision.
export function recordSpeculativeRound(run: InferenceRun, round: P4SpeculativeRound, atUnixMs: number) {
  if (round.session_id !== run.id || round.load_generation !== run.loadGeneration) throw new Error("P4 speculative round identity does not match the active run");
  const request = run.requests.find(value => value.id === round.request_id);
  if (!request) throw new Error("P4 speculative round references an unknown request");
  let seen = observations.get(run);
  if (!seen) { seen = new Map(); observations.set(run, seen); }
  const fingerprint = JSON.stringify(round);
  const previous = seen.get(round.observation_id);
  if (previous !== undefined) {
    if (previous !== fingerprint) throw new Error("P4 speculative observation ID has conflicting contents");
    return false;
  }
  seen.set(round.observation_id, fingerprint);
  run.speculative ??= empty(); request.speculative ??= empty();
  accumulate(run.speculative, round, atUnixMs); accumulate(request.speculative, round, atUnixMs);
  return true;
}
