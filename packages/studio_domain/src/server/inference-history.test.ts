import { expect, it } from 'vitest';
import { parseInferenceRun, type DeploymentInput, llamaUbatchSize } from '../common/index.js';
import { projectHistoryUbatch } from './inference-history.js';

it('LOAD의64를 기본128 대신 읽고 과거 기록의 대체 용량만 교정한다', () => {
  const model = { adapter: 'llamacpp', stages: [{ planText: '--model m --layer-begin 0 --layer-end 1', loadOptionsJson: JSON.stringify({ endpoint: '127.0.0.1:24110', n_batch: 64, n_ubatch: 64, context_size: 4096, total_context_size: 65536, sequence_capacity: 16 }) }] } as DeploymentInput;
  expect(llamaUbatchSize(model)).toBe(64);
  const run = parseInferenceRun({ id: 'run', modelId: 'model', modelName: '모델', state: 'completed', submitted: 0, completed: 0, createdAt: '', error: null, nUbatch: 128, requests: [], telemetrySeries: { version: 1, output: [], spans: [], batches: [{ atUnixMs: 0, stageIndex: 0, observations: 3, executions: 3, physicalBatches: 3, mixedPhysicalBatches: 0, capacityRows: 320, fallbackCapacityRows: 256, rows: 48, readyRowsMax: 0, prefillRows: 16, decodeRows: 32, verifyRows: 0, replayRows: 0, stageMs: 10, idleMs: 0 }] } });
  projectHistoryUbatch(run, llamaUbatchSize(model));
  expect(run.nUbatch).toBe(64);
  expect(run.telemetrySeries.batches[0]).toMatchObject({ capacityRows: 192, fallbackCapacityRows: 128, rows: 48, prefillRows: 16, decodeRows: 32 });
  projectHistoryUbatch(run, 64);
  expect(run.telemetrySeries.batches[0]!.capacityRows).toBe(192);
});
