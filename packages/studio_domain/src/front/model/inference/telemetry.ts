import type {
  InferenceBatch,
  InferenceMonitoring,
  InferenceRun,
  InferenceStageSpan,
  P4BatchObservation,
  P4StageSpan,
} from "../../../common/protocol/inference/index.js";

const HISTORY_LIMIT = 240;
const key = (modelId: string, address: string, nodeId: string, generation: number) => JSON.stringify([modelId, address, nodeId, generation]);

// See docs/api.md#inference-telemetry.
export class InferenceTelemetryCache {
  private readonly batches = new Map<string, InferenceBatch>();
  private readonly spans = new Map<string, InferenceStageSpan>();

  recordBatch(modelId: string, address: string, nodeId: string, generation: number, value: P4BatchObservation, observedAt: string) {
    const total = (field: "rows" | "prefill_rows" | "decode_rows" | "verify_rows" | "replay_rows" | "request_count" | "sequence_count") =>
      value.physical_batches.reduce((sum, batch) => sum + batch[field], 0);
    const batch: InferenceBatch = {
      observationId: value.observation_id,
      logicalOrdinal: value.logical_ordinal,
      logicalRows: value.logical_rows,
      physicalBatchCount: value.physical_batches.length,
      mixedPhysicalBatches: value.mixed_physical_batches,
      rows: total("rows"),
      prefillRows: total("prefill_rows"),
      decodeRows: total("decode_rows"),
      verifyRows: total("verify_rows"),
      replayRows: total("replay_rows"),
      requestCount: total("request_count"),
      sequenceCount: total("sequence_count"),
      stageMs: value.stage_ms,
      idleMs: value.idle_ms,
      idleGated: value.idle_gated,
      readyRows: value.ready_rows,
      readySequences: value.ready_sequences,
      scheduling: value.scheduling ?? null,
      observedAt,
    };
    this.batches.set(key(modelId, address, nodeId, generation), batch);
    return batch;
  }

  recordSpan(modelId: string, address: string, nodeId: string, generation: number, value: P4StageSpan, observedAt: string) {
    const span: InferenceStageSpan = {
      executionCount: value.execution_ids.length,
      rows: value.rows,
      ingressUnixMs: value.ingress_unix_ms,
      startUnixMs: value.start_unix_ms,
      endUnixMs: value.end_unix_ms,
      forwardUnixMs: value.forward_unix_ms,
      stageDurationMs: Math.max(0, value.end_unix_ms - value.start_unix_ms),
      totalDurationMs: Math.max(0, value.forward_unix_ms - value.ingress_unix_ms),
      observedAt,
    };
    this.spans.set(key(modelId, address, nodeId, generation), span);
    return span;
  }

  batch(modelId: string, address: string, nodeId: string, generation: number) {
    return this.batches.get(key(modelId, address, nodeId, generation)) ?? null;
  }

  span(modelId: string, address: string, nodeId: string, generation: number) {
    return this.spans.get(key(modelId, address, nodeId, generation)) ?? null;
  }
}

export function appendMonitoring(run: InferenceRun, snapshot: InferenceMonitoring) {
  const previous = run.monitoring.at(-1);
  const changed = !previous || JSON.stringify(previous.nodes) !== JSON.stringify(snapshot.nodes);
  if (!changed) return false;
  run.monitoring.push(structuredClone(snapshot));
  if (run.monitoring.length > HISTORY_LIMIT) run.monitoring.splice(0, run.monitoring.length - HISTORY_LIMIT);
  return true;
}
