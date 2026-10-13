import { Router, json } from 'express';
import { inferenceRoutes, parseInferenceRun, llamaUbatchSize, type InferenceRun, type InferenceRunsResponse, type InferenceHistoryErrorResponse, type DeploymentRecord } from '@p4studio/studio_domain/common';
import { historyWriteError, historyDeleteError, projectHistoryUbatch } from '@p4studio/studio_domain/server';
import type { StudioDatabase } from '../database/client.js';
import { DeploymentRepository } from '../database/deployments.js';

/** 브라우저가 작성한 관측만 저장한다. P4 명령과 토큰 스트림은 중계하지 않는다. */
export function createInferenceHistoryRouter(database: StudioDatabase) {
  const router = Router();
  const db = database.connection;
  db.exec('CREATE TABLE IF NOT EXISTS inference_history (id TEXT PRIMARY KEY, document TEXT NOT NULL)');
  const get = (id: string): InferenceRun | undefined => {
    const row = db.prepare('SELECT document FROM inference_history WHERE id=?').get(id);
    return row ? parseInferenceRun(JSON.parse(String(row.document))) : undefined;
  };
  const rejected = (message: string): InferenceHistoryErrorResponse => ({ error: { code: 'inference_history_rejected', message } });
  router.use('/api/inference/runs', json({ limit: '16mb' }));
  router.get(inferenceRoutes.runs.path, (_req, res) => {
    const runs = db.prepare('SELECT document FROM inference_history').all().map(row => parseInferenceRun(JSON.parse(String(row.document))));
    const deployments = new DeploymentRepository(db), current = deployments.list(), archive = new Map<string, DeploymentRecord[]>();
    for (const run of runs) {
      if (!run.loadGeneration) continue;
      let record = current.find(record => record.id === run.modelId && record.loadGeneration === run.loadGeneration && ['loaded', 'ready', 'unloaded'].includes(record.status));
      if (!record) {
        if (!archive.has(run.modelId)) archive.set(run.modelId, deployments.history(run.modelId).map(row => row.record));
        record = archive.get(run.modelId)!.find(record => record.loadGeneration === run.loadGeneration && ['loaded', 'ready', 'unloaded'].includes(record.status));
      }
      if (record) projectHistoryUbatch(run, llamaUbatchSize(record));
    }
    res.json({ runs } satisfies InferenceRunsResponse);
  });
  router.put(inferenceRoutes.saveRun.path, (req, res) => {
    let run: InferenceRun;
    try { run = parseInferenceRun(req.body); } catch { return res.status(400).json(rejected('실행 기록 형식이 잘못되었습니다.')); }
    if (run.id !== req.params.id) return res.status(400).json(rejected('실행 ID가 일치하지 않습니다.'));
    const error = historyWriteError(get(run.id), run);
    if (error) return res.status(409).json(rejected(error));
    db.prepare('INSERT INTO inference_history(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(run.id, JSON.stringify(run));
    return res.json(run);
  });
  router.delete(inferenceRoutes.removeRun.path, (req, res) => {
    const run = get(String(req.params.id)), error = run && historyDeleteError(run);
    if (error) return res.status(409).json(rejected(error));
    db.prepare('DELETE FROM inference_history WHERE id=?').run(String(req.params.id));
    return res.status(204).end();
  });
  return router;
}
