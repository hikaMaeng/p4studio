import { inferenceRoutes, parseInferenceRuns, type InferenceRun } from '@p4studio/studio_domain/common';
import { BrowserInferenceHistory } from './history.js';

/** 로컬 반환 소유권 원장은 유지하고 운영 기록을 서버에 공유한다. */
export class SharedInferenceHistory extends BrowserInferenceHistory {
  override async read(): Promise<unknown> {
    const local = parseInferenceRuns(await super.read()).runs;
    const response = await fetch(inferenceRoutes.runs.path);
    if (!response.ok) throw new Error(`공유 실행 기록 조회 실패: ${response.status}`);
    const remote = parseInferenceRuns(await response.json()).runs;
    const merged = new Map(remote.map(run => [run.id, run]));
    for (const run of local) {
      const saved = merged.get(run.id);
      if (!saved || (run.ownershipCheckpoint?.settled ?? 0) >= (saved.ownershipCheckpoint?.settled ?? 0)) merged.set(run.id, run);
    }
    return { timingVersion: 3, runs: [...merged.values()] };
  }
  override async save(run: InferenceRun) {
    await super.save(run);
    const response = await fetch(inferenceRoutes.saveRun.path.replace(':id', encodeURIComponent(run.id)), { method: inferenceRoutes.saveRun.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) });
    if (!response.ok) throw new Error(`공유 실행 기록 저장 실패: ${response.status}`);
  }
  override async remove(id: string) {
    const response = await fetch(inferenceRoutes.removeRun.path.replace(':id', encodeURIComponent(id)), { method: inferenceRoutes.removeRun.method });
    if (!response.ok) throw new Error(`공유 실행 기록 삭제 실패: ${response.status}`);
    await super.remove(id);
  }
}
