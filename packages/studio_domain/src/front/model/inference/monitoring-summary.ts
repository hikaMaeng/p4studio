import type {
  InferenceBatch,
  InferenceMonitoring,
  InferenceMonitoringSummary,
  InferenceNode,
  InferenceRun,
  InferenceStageMonitoringSummary,
  InferenceStageSpan,
  P4BatchObservation,
  P4StageSpan,
} from "../../../common/protocol/inference/index.js";

type StageIdentity = Pick<InferenceNode, "stageIndex" | "agentName" | "nodeId">;

const emptySummary = (): InferenceMonitoringSummary => ({ batchObservations: 0, stageSpans: 0, stages: [] });
const seenEvents = new WeakMap<InferenceRun, { batches: Set<string>; spans: Set<string> }>();
const seenFor = (run: InferenceRun) => {
  let seen = seenEvents.get(run);
  if (!seen) { seen = { batches: new Set(), spans: new Set() }; seenEvents.set(run, seen); }
  return seen;
};

const stageSummary = (summary: InferenceMonitoringSummary, stage: StageIdentity): InferenceStageMonitoringSummary => {
  const existing = summary.stages.find(value => value.stageIndex === stage.stageIndex && value.nodeId === stage.nodeId);
  if (existing) return existing;
  const created: InferenceStageMonitoringSummary = {
    stageIndex: stage.stageIndex,
    agentName: stage.agentName,
    nodeId: stage.nodeId,
    batchObservations: 0,
    stageSpans: 0,
    physicalBatches: 0,
    mixedPhysicalBatches: 0,
    rows: 0,
    prefillRows: 0,
    decodeRows: 0,
    verifyRows: 0,
    replayRows: 0,
    executionCount: 0,
    batchStageMs: 0,
    idleMs: 0,
    idleGated: 0,
    spanStageMs: 0,
    spanTotalMs: 0,
    maxReadyRows: 0,
    maxReadySequences: 0,
    lastObservedAt: null,
  };
  summary.stages.push(created);
  summary.stages.sort((left, right) => left.stageIndex - right.stageIndex);
  return created;
};

export function recordBatchSummary(run: InferenceRun, stage: StageIdentity, value: P4BatchObservation, observedAt: string) {
  const summary = run.monitoringSummary ??= emptySummary();
  const eventKey = `${stage.stageIndex}\0${stage.nodeId}\0${value.observation_id}`;
  const seen = seenFor(run).batches;
  if (seen.has(eventKey)) return false;
  seen.add(eventKey);
  const target = stageSummary(summary, stage);
  const total = (field: "rows" | "prefill_rows" | "decode_rows" | "verify_rows" | "replay_rows") =>
    value.physical_batches.reduce((sum, batch) => sum + batch[field], 0);
  summary.batchObservations += 1;
  target.batchObservations += 1;
  target.physicalBatches += value.physical_batches.length;
  target.mixedPhysicalBatches += value.mixed_physical_batches;
  target.rows += total("rows");
  target.prefillRows += total("prefill_rows");
  target.decodeRows += total("decode_rows");
  target.verifyRows += total("verify_rows");
  target.replayRows += total("replay_rows");
  target.batchStageMs += value.stage_ms;
  target.idleMs += value.idle_ms;
  target.idleGated += value.idle_gated;
  target.maxReadyRows = Math.max(target.maxReadyRows, value.ready_rows);
  target.maxReadySequences = Math.max(target.maxReadySequences, value.ready_sequences);
  target.lastObservedAt = observedAt;
  return true;
}

export function recordSpanSummary(run: InferenceRun, stage: StageIdentity, value: P4StageSpan, observedAt: string) {
  const summary = run.monitoringSummary ??= emptySummary();
  const eventKey = `${stage.stageIndex}\0${stage.nodeId}\0${value.execution_ids.join(",")}\0${value.ingress_unix_ms}\0${value.start_unix_ms}\0${value.end_unix_ms}\0${value.forward_unix_ms}`;
  const seen = seenFor(run).spans;
  if (seen.has(eventKey)) return false;
  seen.add(eventKey);
  const target = stageSummary(summary, stage);
  summary.stageSpans += 1;
  target.stageSpans += 1;
  target.executionCount += value.execution_ids.length;
  target.spanStageMs += Math.max(0, value.end_unix_ms - value.start_unix_ms);
  target.spanTotalMs += Math.max(0, value.forward_unix_ms - value.ingress_unix_ms);
  target.lastObservedAt = observedAt;
  return true;
}

const addProjectedBatch = (target: InferenceStageMonitoringSummary, batch: InferenceBatch) => {
  target.batchObservations += 1;
  target.physicalBatches += batch.physicalBatchCount;
  target.mixedPhysicalBatches += batch.mixedPhysicalBatches;
  target.rows += batch.rows;
  target.prefillRows += batch.prefillRows;
  target.decodeRows += batch.decodeRows;
  target.verifyRows += batch.verifyRows;
  target.replayRows += batch.replayRows;
  target.batchStageMs += batch.stageMs;
  target.idleMs += batch.idleMs;
  target.idleGated += batch.idleGated;
  target.maxReadyRows = Math.max(target.maxReadyRows, batch.readyRows);
  target.maxReadySequences = Math.max(target.maxReadySequences, batch.readySequences);
  target.lastObservedAt = batch.observedAt;
};

const addProjectedSpan = (target: InferenceStageMonitoringSummary, span: InferenceStageSpan) => {
  target.stageSpans += 1;
  target.executionCount += span.executionCount;
  target.spanStageMs += span.stageDurationMs;
  target.spanTotalMs += span.totalDurationMs;
  target.lastObservedAt = span.observedAt;
};

/** Builds a best-effort summary for history written before monitoringSummary existed. */
export function summarizeLegacyMonitoring(snapshots: InferenceMonitoring[]): InferenceMonitoringSummary {
  const summary = emptySummary();
  const batches = new Set<string>();
  const spans = new Set<string>();
  for (const snapshot of snapshots) for (const node of snapshot.nodes) {
    const target = stageSummary(summary, node);
    if (node.latestBatch) {
      const batchKey = `${node.stageIndex}\0${node.nodeId}\0${node.latestBatch.observationId}`;
      if (!batches.has(batchKey)) { batches.add(batchKey); addProjectedBatch(target, node.latestBatch); summary.batchObservations += 1; }
    }
    if (node.latestSpan) {
      const span = node.latestSpan;
      const spanKey = `${node.stageIndex}\0${node.nodeId}\0${span.ingressUnixMs}\0${span.startUnixMs}\0${span.endUnixMs}\0${span.forwardUnixMs}`;
      if (!spans.has(spanKey)) { spans.add(spanKey); addProjectedSpan(target, span); summary.stageSpans += 1; }
    }
  }
  return summary;
}

export const monitoringSummaryFor = (run: InferenceRun): InferenceMonitoringSummary =>
  run.monitoringSummary ?? summarizeLegacyMonitoring(run.monitoring);

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};

export function requestMetrics(run: InferenceRun) {
  const totalTokens = run.requests.reduce((sum, request) => sum + request.receivedTokens, 0);
  const ttft = run.requests.map(request => request.ttftMs).filter((value): value is number => value !== null);
  const finalTps = run.requests.map(request => request.finalTps).filter((value): value is number => value !== null);
  return {
    totalTokens,
    ttftP50Ms: percentile(ttft, .5),
    ttftP95Ms: percentile(ttft, .95),
    ttftMaxMs: ttft.length ? Math.max(...ttft) : null,
    finalTpsP50: percentile(finalTps, .5),
  };
}

export function waveMetrics(run: InferenceRun) {
  const indexes = [...new Set(run.requests.map(request => request.waveIndex).filter((value): value is number => value !== null))].sort((left, right) => left - right);
  return indexes.map(waveIndex => {
    const requests = run.requests.filter(request => request.waveIndex === waveIndex);
    const ttft = requests.map(request => request.ttftMs).filter((value): value is number => value !== null);
    return {
      waveIndex,
      submitted: requests.length,
      completed: requests.filter(request => request.state === "completed").length,
      sentAt: requests.map(request => request.submittedAt).sort()[0] ?? null,
      ttftP50Ms: percentile(ttft, .5),
      ttftP95Ms: percentile(ttft, .95),
      ttftMaxMs: ttft.length ? Math.max(...ttft) : null,
    };
  });
}
