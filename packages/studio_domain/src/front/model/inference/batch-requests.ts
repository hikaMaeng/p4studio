import type { BatchRequestDistribution, BatchRequestDistributions, P4BatchObservation } from "../../../common/protocol/inference/index.js";

const empty = (): BatchRequestDistribution => ({ buckets: [0, 0, 0, 0, 0], batches: 0, requests: 0, multiRequestBatches: 0 });
export const emptyBatchRequestDistributions = (): BatchRequestDistributions => ({ all: empty(), prefill: empty(), decode: empty(), verify: empty(), replay: empty() });
const phases = ["prefill", "decode", "verify", "replay"] as const;

/** 공개 owned_requests만 계산한다. 다른 OUTER의 소유자와 0개 표본은 복원하지 않는다.
 * see docs/api.md#batch-request-distribution. 관측 중복 제거는 호출자의 recordBatchSummary가 소유한다. */
export function summarizeBatchRequestDistributions(value: P4BatchObservation): BatchRequestDistributions {
  const target = emptyBatchRequestDistributions();
  const add = (distribution: BatchRequestDistribution, count: number) => {
    if (!count) return;
    distribution.buckets[Math.min(count, 5) - 1]! += 1;
    distribution.batches += 1; distribution.requests += count;
    if (count > 1) distribution.multiRequestBatches += 1;
  };
  for (const physical of value.physical_batches) {
    add(target.all, new Set(physical.owned_requests.map(owner => owner.request_id)).size);
    for (const phase of phases) add(target[phase], new Set(physical.owned_requests.filter(owner => owner[`${phase}_rows`] > 0).map(owner => owner.request_id)).size);
  }
  return target;
}

export function addBatchRequestDistributions(target: BatchRequestDistributions, value: P4BatchObservation): void {
  const measured = summarizeBatchRequestDistributions(value);
  for (const phase of ["all", ...phases] as const) {
    target[phase].batches += measured[phase].batches;
    target[phase].requests += measured[phase].requests;
    target[phase].multiRequestBatches += measured[phase].multiRequestBatches;
    for (let index = 0; index < 5; index++) target[phase].buckets[index]! += measured[phase].buckets[index]!;
  }
}

export function batchRequestStatistics(value: BatchRequestDistribution) {
  return { average: value.batches ? value.requests / value.batches : null,
    multiRequestRatio: value.batches ? value.multiRequestBatches / value.batches : null };
}
