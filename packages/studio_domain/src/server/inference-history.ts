import type { InferenceRun } from '../common/protocol/inference/index.js';

/** 저장된 실행은 관측 기록이며 P4 실행 또는 반환 경로의 소유권이 아니다. */
export function historyWriteError(previous: InferenceRun | undefined, next: InferenceRun): string | null {
  if (previous && previous.modelId !== next.modelId) return '실행의 모델을 변경할 수 없습니다.';
  const old = previous?.ownershipCheckpoint, current = next.ownershipCheckpoint;
  if (old && (!current || current.admitted < old.admitted || current.settled < old.settled)) return '오래된 실행 기록입니다.';
  return null;
}
export function historyDeleteError(run: InferenceRun): string | null {
  return ['preparing', 'running', 'settling', 'cancelling'].includes(run.state) || (run.pendingSettlement ?? 0) > 0 || (run.ownershipCheckpoint?.admitted ?? 0) > (run.ownershipCheckpoint?.settled ?? 0)
    ? '미정산 실행은 삭제할 수 없습니다.' : null;
}
/** 동일 LOAD 세대의 선언으로 잘못된 기본 UBATCH와 그 대체 분모만 교정한다. */
export function projectHistoryUbatch(run: InferenceRun, ubatch: number | null): InferenceRun {
  if (!ubatch || !run.nUbatch || ubatch === run.nUbatch) return run;
  const previous = run.nUbatch;
  for (const item of [...run.telemetrySeries.batches, ...(run.monitoringSummary?.stages ?? [])]) {
    const old = item.fallbackCapacityRows;
    if (old % previous !== 0) continue;
    item.fallbackCapacityRows = old / previous * ubatch;
    item.capacityRows += item.fallbackCapacityRows - old;
  }
  run.nUbatch = ubatch;
  return run;
}
