import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { StudioDatabase } from '../database/client.js';

it('서로 다른 앱 인스턴스에서 실행 전문과 관측을 복원하고 오래된 기록을 거부한다', async () => {
  const database = new StudioDatabase(':memory:');
  try {
    const owner = createApp(database), reader = createApp(database);
    const run = { id: 'run', modelId: 'model', modelName: '실측 모델', state: 'completed', submitted: 1, completed: 1, createdAt: '2026-10-14T00:00:00Z', error: null,
      ownershipCheckpoint: { admitted: 1, settled: 1 }, requests: [{ id: 'request', state: 'completed', prompt: '질문', text: '정상 응답 전문', receivedTokens: 2, prefillTps: 10, generationTps: 20, ttftMs: 100, finalTps: 20, submittedAt: '2026-10-14T00:00:00Z', completedAt: '2026-10-14T00:00:01Z', error: null }],
      batchRequestDistributions: Object.fromEntries(['all','prefill','decode','verify','replay'].map(key => [key, { buckets: [1,0,0,0,0], batches: 1, requests: 1, multiRequestBatches: 0 }])) };
    await request(owner).put('/api/inference/runs/run').send(run).expect(200);
    const restored = await request(reader).get('/api/inference/runs').expect(200);
    expect(restored.body.runs[0].requests[0].text).toBe('정상 응답 전문');
    expect(restored.body.runs[0].batchRequestDistributions).toEqual(run.batchRequestDistributions);
    await request(owner).put('/api/inference/runs/run').send({ ...run, ownershipCheckpoint: { admitted: 1, settled: 0 } }).expect(409);
    await request(reader).delete('/api/inference/runs/run').expect(204);
    expect((await request(reader).get('/api/inference/runs')).body.runs).toEqual([]);
    await request(owner).put('/api/inference/runs/run').send({ ...run, state: 'running', ownershipCheckpoint: { admitted: 1, settled: 0 } }).expect(200);
    await request(reader).delete('/api/inference/runs/run').expect(409);
  } finally { database.close(); }
});
