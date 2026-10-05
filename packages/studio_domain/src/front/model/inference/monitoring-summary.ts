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
    capacityRows: 0,
    fallbackCapacityRows: 0,
    mixedPhysicalBatches: 0,
    rows: 0,
    prefillRows: 0,
    decodeRows: 0,
    verifyRows: 0,
    replayRows: 0,
    executionCount: 0,
    batchStageMs: 0,
    idleMs: 0,
    initialIdleMs: 0,
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
  // P4 idle_ms is elapsed time since the stage's previous local completion. The first observation of a run can
  // therefore include time from before the run started; keep it out of the run-internal idle sum.
  const firstObservation = target.batchObservations === 0;
  target.batchObservations += 1;
  target.physicalBatches += value.physical_batches.length;
  const issueLimit = value.scheduling?.max_issue_rows ?? 0;
  const capacityRows = issueLimit > 0 ? issueLimit : run.nUbatch;
  target.capacityRows += capacityRows * value.physical_batches.length;
  if (issueLimit <= 0) target.fallbackCapacityRows += capacityRows * value.physical_batches.length;
  // Wire meaning: physical batches mixing prefill and decode/verify/replay phases (phase-mixed), not multi-request.
  target.mixedPhysicalBatches += value.mixed_physical_batches;
  target.rows += total("rows");
  target.prefillRows += total("prefill_rows");
  target.decodeRows += total("decode_rows");
  target.verifyRows += total("verify_rows");
  target.replayRows += total("replay_rows");
  target.batchStageMs += value.stage_ms;
  if (firstObservation) target.initialIdleMs = value.idle_ms; else target.idleMs += value.idle_ms;
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
  // Same first-observation split as recordBatchSummary, applied to the first distinct projected batch of the stage.
  const firstObservation = target.batchObservations === 0;
  target.batchObservations += 1;
  target.physicalBatches += batch.physicalBatchCount;
  const scheduling = batch.scheduling && typeof batch.scheduling === "object" ? batch.scheduling as Record<string, unknown> : null;
  const issueLimit = typeof scheduling?.max_issue_rows === "number" ? scheduling.max_issue_rows : 0;
  if (issueLimit > 0) target.capacityRows += issueLimit * batch.physicalBatchCount;
  target.mixedPhysicalBatches += batch.mixedPhysicalBatches;
  target.rows += batch.rows;
  target.prefillRows += batch.prefillRows;
  target.decodeRows += batch.decodeRows;
  target.verifyRows += batch.verifyRows;
  target.replayRows += batch.replayRows;
  target.batchStageMs += batch.stageMs;
  if (firstObservation) target.initialIdleMs = batch.idleMs; else target.idleMs += batch.idleMs;
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

export function monitoringSummaryFor(run: InferenceRun): InferenceMonitoringSummary {
  const summary = run.monitoringSummary ?? summarizeLegacyMonitoring(run.monitoring);
  if (!run.telemetrySeries.batches.length || summary.stages.every(stage => stage.capacityRows > 0 || stage.physicalBatches === 0)) return summary;
  const capacities = new Map<number, { capacityRows: number; fallbackCapacityRows: number }>();
  for (const point of run.telemetrySeries.batches) {
    const value = capacities.get(point.stageIndex) ?? { capacityRows: 0, fallbackCapacityRows: 0 };
    value.capacityRows += point.capacityRows;
    value.fallbackCapacityRows += point.fallbackCapacityRows;
    capacities.set(point.stageIndex, value);
  }
  return {
    ...summary,
    stages: summary.stages.map(stage => {
      if (stage.capacityRows > 0 || stage.physicalBatches === 0) return stage;
      const observed = capacities.get(stage.stageIndex);
      return observed ? { ...stage, ...observed } : stage;
    }),
  };
}

export function batchUsageMetrics(run: InferenceRun, summary = monitoringSummaryFor(run)) {
  const totals = summary.stages.reduce((value, stage) => ({
    physicalBatches: value.physicalBatches + stage.physicalBatches,
    rows: value.rows + stage.rows,
    prefillRows: value.prefillRows + stage.prefillRows,
    decodeRows: value.decodeRows + stage.decodeRows,
    verifyRows: value.verifyRows + stage.verifyRows,
    replayRows: value.replayRows + stage.replayRows,
    capacityRows: value.capacityRows + stage.capacityRows,
    fallbackCapacityRows: value.fallbackCapacityRows + stage.fallbackCapacityRows,
  }), { physicalBatches: 0, rows: 0, prefillRows: 0, decodeRows: 0, verifyRows: 0, replayRows: 0, capacityRows: 0, fallbackCapacityRows: 0 });
  const seriesCapacity = run.telemetrySeries.batches.reduce((value, point) => ({
    capacityRows: value.capacityRows + point.capacityRows,
    fallbackCapacityRows: value.fallbackCapacityRows + point.fallbackCapacityRows,
  }), { capacityRows: 0, fallbackCapacityRows: 0 });
  // Older persisted summaries predate cumulative capacity fields; use their retained one-second series when available.
  const capacityRows = totals.capacityRows > 0 ? totals.capacityRows : seriesCapacity.capacityRows;
  const fallbackCapacityRows = totals.capacityRows > 0 ? totals.fallbackCapacityRows : seriesCapacity.fallbackCapacityRows;
  const stageIndexes = new Set(summary.stages.map(stage => stage.stageIndex));
  const observedStageIndexes = new Set(summary.stages.filter(stage => stage.batchObservations > 0).map(stage => stage.stageIndex));
  return {
    ...totals,
    capacityRows,
    fallbackCapacityRows,
    configuredUbatch: run.nUbatch,
    observedStages: observedStageIndexes.size,
    totalStages: stageIndexes.size,
    fillPercent: capacityRows > 0 ? totals.rows * 100 / capacityRows : null,
  };
}

/** Aggregate approved output token events by wall-clock second across every concurrent request. */
export function outputTpsMetrics(run: InferenceRun) {
  const tokensBySecond = new Map<number, number>();
  for (const point of run.telemetrySeries.output) {
    const second = Math.floor(point.atUnixMs / 1000) * 1000;
    tokensBySecond.set(second, (tokensBySecond.get(second) ?? 0) + point.tokens);
  }
  if (!tokensBySecond.size) return { averageTps: null, peakTps: null };

  const seconds = [...tokensBySecond.keys()].sort((left, right) => left - right);
  const firstSecond = seconds[0]!;
  const lastSecond = seconds.at(-1)!;
  const sliceCount = Math.floor((lastSecond - firstSecond) / 1000) + 1;
  const totalTokens = [...tokensBySecond.values()].reduce((sum, count) => sum + count, 0);
  const peakTokensPerSecond = Math.max(...tokensBySecond.values());
  return { averageTps: totalTokens / sliceCount, peakTps: peakTokensPerSecond };
}

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
};

export function requestMetrics(run: InferenceRun) {
  const totalTokens = run.requests.reduce((sum, request) => sum + request.receivedTokens, 0);
  const ttft = run.requests.map(request => request.ttftMs).filter((value): value is number => value !== null);
  const outputTps = outputTpsMetrics(run);
  return {
    totalTokens,
    ttftP50Ms: percentile(ttft, .5),
    ttftP95Ms: percentile(ttft, .95),
    ttftMaxMs: ttft.length ? Math.max(...ttft) : null,
    outputTpsAverage: outputTps.averageTps,
    outputTpsPeak: outputTps.peakTps,
  };
}

export function groupInferenceWaves(run: InferenceRun) {
  const groups = new Map<number | null, InferenceRun["requests"]>();
  for (const request of run.requests) {
    const requests = groups.get(request.waveIndex) ?? [];
    requests.push(request);
    groups.set(request.waveIndex, requests);
  }
  return [...groups.entries()].sort(([left], [right]) => left === null ? 1 : right === null ? -1 : left - right).map(([waveIndex, requests]) => {
    const ttft = requests.map(request => request.ttftMs).filter((value): value is number => value !== null);
    const prefillTps = requests.map(request => request.prefillTps).filter((value): value is number => value !== null);
    const generationTps = requests.map(request => request.generationTps).filter((value): value is number => value !== null);
    const finalTps = requests.map(request => request.finalTps).filter((value): value is number => value !== null);
    const submittedAt = requests.map(request => Date.parse(request.submittedAt)).filter(Number.isFinite);
    const completedAt = requests.map(request => request.completedAt === null ? Number.NaN : Date.parse(request.completedAt)).filter(Number.isFinite);
    return {
      waveIndex,
      requests,
      submitted: requests.length,
      completed: requests.filter(request => request.state === "completed").length,
      sentAt: requests.map(request => request.submittedAt).sort()[0] ?? null,
      ttftP50Ms: percentile(ttft, .5),
      ttftP95Ms: percentile(ttft, .95),
      ttftMaxMs: ttft.length ? Math.max(...ttft) : null,
      prefillTpsP50: percentile(prefillTps, .5),
      generationTpsP50: percentile(generationTps, .5),
      finalTpsP50: percentile(finalTps, .5),
      elapsedMs: requests.length > 0 && submittedAt.length === requests.length && completedAt.length === requests.length
        ? Math.max(...completedAt) - Math.min(...submittedAt)
        : null,
    };
  });
}

export type InferenceWave = ReturnType<typeof groupInferenceWaves>[number];

export function waveMetrics(run: InferenceRun) {
  return groupInferenceWaves(run).filter(wave => wave.waveIndex !== null).map(({ requests: _requests, ...metrics }) => ({ ...metrics, waveIndex: metrics.waveIndex! }));
}
