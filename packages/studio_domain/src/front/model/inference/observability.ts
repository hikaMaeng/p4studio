import type {
  InferenceRequest,
  InferenceRequestTelemetry,
  InferenceRun,
  P4BatchObservation,
  P4StageSpan,
} from "../../../common/protocol/inference/index.js";

type StageIdentity = { stageIndex: number; agentName: string; nodeId: string };
const SECOND_MS = 1000;
const bucket = (unixMs: number) => Math.floor(unixMs / SECOND_MS) * SECOND_MS;

export const emptyRequestTelemetry = (): InferenceRequestTelemetry => ({
  batchObservations: 0, physicalBatches: 0, issueCount: 0, mixedPhysicalBatches: 0,
  prefillRows: 0, decodeRows: 0, verifyRows: 0, replayRows: 0,
  batchFillRatioSum: 0, batchFillSamples: 0, maxBatchFillRatio: 0, maxReadyRows: 0, stages: [],
});

const requestTelemetry = (request: InferenceRequest) => request.telemetry ??= emptyRequestTelemetry();
const numericTime = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Date.now();

export function recordOutputObservability(run: InferenceRun, receivedAtUnixMs: number, terminal: boolean) {
  const atUnixMs = bucket(receivedAtUnixMs);
  let point = run.telemetrySeries.output.find(value => value.atUnixMs === atUnixMs);
  if (!point) {
    point = { atUnixMs, tokens: 0, completed: 0, queued: 0, streaming: 0 };
    run.telemetrySeries.output.push(point);
  }
  point.tokens += 1;
  if (terminal) point.completed += 1;
  point.queued = run.requests.filter(request => request.state === "queued").length;
  point.streaming = run.requests.filter(request => request.state === "streaming").length;
}

export function recordBatchObservability(run: InferenceRun, stage: StageIdentity, value: P4BatchObservation, observedAt: string) {
  const atUnixMs = bucket(numericTime(observedAt));
  let point = run.telemetrySeries.batches.find(item => item.atUnixMs === atUnixMs && item.stageIndex === stage.stageIndex);
  if (!point) {
    point = { atUnixMs, stageIndex: stage.stageIndex, observations: 0, physicalBatches: 0, capacityRows: 0, rows: 0, readyRowsMax: 0, prefillRows: 0, decodeRows: 0, verifyRows: 0, replayRows: 0, stageMs: 0, idleMs: 0 };
    run.telemetrySeries.batches.push(point);
  }
  point.observations += 1;
  point.physicalBatches += value.physical_batches.length;
  point.capacityRows += run.nUbatch * value.physical_batches.length;
  point.rows += value.physical_batches.reduce((sum, physical) => sum + physical.rows, 0);
  point.readyRowsMax = Math.max(point.readyRowsMax, value.ready_rows);
  point.prefillRows += value.physical_batches.reduce((sum, physical) => sum + physical.prefill_rows, 0);
  point.decodeRows += value.physical_batches.reduce((sum, physical) => sum + physical.decode_rows, 0);
  point.verifyRows += value.physical_batches.reduce((sum, physical) => sum + physical.verify_rows, 0);
  point.replayRows += value.physical_batches.reduce((sum, physical) => sum + physical.replay_rows, 0);
  point.stageMs += value.stage_ms;
  point.idleMs += value.idle_ms;

  const seenRequests = new Set<string>();
  for (const physical of value.physical_batches) for (const owned of physical.owned_requests) {
    const request = run.requests.find(item => item.id === owned.request_id);
    if (!request) continue;
    const telemetry = requestTelemetry(request);
    if (!seenRequests.has(request.id)) { telemetry.batchObservations += 1; seenRequests.add(request.id); }
    telemetry.physicalBatches += 1;
    telemetry.issueCount += 1;
    if (physical.request_count > 1) telemetry.mixedPhysicalBatches += 1;
    telemetry.prefillRows += owned.prefill_rows;
    telemetry.decodeRows += owned.decode_rows;
    telemetry.verifyRows += owned.verify_rows;
    telemetry.replayRows += owned.replay_rows;
    telemetry.maxReadyRows = Math.max(telemetry.maxReadyRows, value.ready_rows);
    if (run.nUbatch > 0) {
      const ratio = physical.rows / run.nUbatch;
      telemetry.batchFillRatioSum += ratio;
      telemetry.batchFillSamples += 1;
      telemetry.maxBatchFillRatio = Math.max(telemetry.maxBatchFillRatio, ratio);
    }
  }
}

export function recordSpanObservability(run: InferenceRun, stage: StageIdentity, value: P4StageSpan, observedAt: string) {
  const atUnixMs = bucket(numericTime(observedAt));
  const ingressQueueMs = Math.max(0, value.start_unix_ms - value.ingress_unix_ms);
  const stageMs = Math.max(0, value.end_unix_ms - value.start_unix_ms);
  const forwardMs = Math.max(0, value.forward_unix_ms - value.end_unix_ms);
  let point = run.telemetrySeries.spans.find(item => item.atUnixMs === atUnixMs && item.stageIndex === stage.stageIndex);
  if (!point) {
    point = { atUnixMs, stageIndex: stage.stageIndex, spans: 0, executions: 0, rows: 0, ingressQueueMs: 0, stageMs: 0, forwardMs: 0 };
    run.telemetrySeries.spans.push(point);
  }
  point.spans += 1;
  point.executions += value.execution_ids.length;
  point.rows += value.rows;
  point.ingressQueueMs += ingressQueueMs;
  point.stageMs += stageMs;
  point.forwardMs += forwardMs;

  const owners = new Map<string, number>();
  for (const execution of value.executions) for (const owned of execution.owned_requests) owners.set(owned.request_id, (owners.get(owned.request_id) ?? 0) + 1);
  for (const [requestId, executions] of owners) {
    const request = run.requests.find(item => item.id === requestId);
    if (!request) continue;
    const telemetry = requestTelemetry(request);
    let summary = telemetry.stages.find(item => item.stageIndex === stage.stageIndex && item.nodeId === stage.nodeId);
    if (!summary) {
      summary = { stageIndex: stage.stageIndex, agentName: stage.agentName, nodeId: stage.nodeId, spans: 0, executions: 0, rows: 0, ingressQueueMs: 0, sharedStageMs: 0, forwardMs: 0, firstIngressUnixMs: null, lastForwardUnixMs: null };
      telemetry.stages.push(summary);
      telemetry.stages.sort((left, right) => left.stageIndex - right.stageIndex);
    }
    summary.spans += 1;
    summary.executions += executions;
    summary.rows += value.rows;
    summary.ingressQueueMs += ingressQueueMs;
    summary.sharedStageMs += stageMs;
    summary.forwardMs += forwardMs;
    summary.firstIngressUnixMs = summary.firstIngressUnixMs === null ? value.ingress_unix_ms : Math.min(summary.firstIngressUnixMs, value.ingress_unix_ms);
    summary.lastForwardUnixMs = summary.lastForwardUnixMs === null ? value.forward_unix_ms : Math.max(summary.lastForwardUnixMs, value.forward_unix_ms);
  }
}

export const requestBatchFillRatio = (request: InferenceRequest) => request.telemetry.batchFillSamples > 0
  ? request.telemetry.batchFillRatioSum / request.telemetry.batchFillSamples : null;
