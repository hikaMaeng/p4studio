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
