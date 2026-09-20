import type { InferenceRequest } from "../../../common/protocol/inference/index.js";

export type RequestTiming = { sentAtMs: number; firstOutputAtMs: number | null; prefillRows: number };

// See docs/api.md#inference-timing. Times use the same monotonic browser clock.
export function recordOutputTiming(request: InferenceRequest, timing: RequestTiming, receivedAtMs: number, terminal: boolean) {
  request.receivedTokens += 1;
  if (timing.firstOutputAtMs === null) {
    timing.firstOutputAtMs = receivedAtMs;
    request.ttftMs = Math.round(receivedAtMs - timing.sentAtMs);
    request.prefillTps = request.ttftMs > 0 && timing.prefillRows > 0 ? timing.prefillRows * 1000 / request.ttftMs : null;
  }
  const elapsedMs = receivedAtMs - timing.firstOutputAtMs;
  request.generationTps = request.receivedTokens > 1 && elapsedMs > 0 ? (request.receivedTokens - 1) * 1000 / elapsedMs : null;
  request.finalTps = terminal ? request.generationTps : null;
}

/** v1 stored N / (last - first); recover the interval rate without inventing timestamps. */
export function migrateLegacyTiming(request: InferenceRequest) {
  request.generationTps = request.receivedTokens > 1 && request.generationTps !== null
    ? request.generationTps * (request.receivedTokens - 1) / request.receivedTokens : null;
  request.finalTps = request.state === "completed" ? request.generationTps : null;
}

/** Pre-v3 history did not timestamp the WebSocket send operation itself. */
export function invalidateLegacyDispatchTiming(request: InferenceRequest) {
  request.ttftMs = null;
  request.prefillTps = null;
  request.waveIndex = null;
}
