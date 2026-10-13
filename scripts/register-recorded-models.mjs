// 공개 HTTP API로 관리 선언만 등록한다. LOAD, probe, 빈 노드 생성은 하지 않는다.
// node scripts/register-recorded-models.mjs <studio-url> <report.json> [preset-id,...]
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { deploymentPresets, deploymentInputSchema, buildLoadPayload } from '../packages/studio_domain/dist/common/index.js';
const [base, reportPath, selectedIds] = process.argv.slice(2);
if (!base || !reportPath) throw new Error('Studio URL과 보고 경로를 지정하세요');
const ids = selectedIds?.split(',');
if (ids?.some(id => !deploymentPresets.some(preset => preset.id === id))) throw new Error('알 수 없는 preset ID');
const presets = deploymentPresets.filter(preset => !ids || ids.includes(preset.id));
const report = { url: base, startedAt: new Date().toISOString(), status: 'running', failedStage: null,
  error: null, applied: [], agents: [], models: [], deployments: [] };
let preflightComplete = false;
let currentStage = '사전 계약 검사';
const api = async (route, body) => {
  const response = await fetch(new URL(route, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  let result;
  try { result = await response.json(); }
  catch (error) { throw new Error(`${route}: 응답 JSON 파싱 실패: ${String(error)}`); }
  if (!response.ok) throw new Error(`${route}: ${response.status}: ${JSON.stringify(result)}`);
  return result;
};
const hostNames = { '192.168.0.29': 'M42-SERVER2', '192.168.0.26': 'Spark', '192.168.0.21': 'Mac21',
  '192.168.0.20': 'Mac20', '192.168.0.22': 'GB10', '192.168.0.6': 'hikaTR', '192.168.0.19': 'Ubuntu 2070',
  '10.10.10.111': 'MI250-01', '10.10.10.2': 'MI250-02' };
const endpointContract = [
  'GET /api/snapshot', 'GET /api/model-deployments', 'POST /api/agents',
  'POST /api/model-deployments', 'POST /api/models',
];
const hasKeys = (value, keys) => value && typeof value === 'object' && keys.every(key => key in value);
const checkpoint = () => {
  const target = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2));
  fs.renameSync(temporary, target);
};
const recordApplied = (kind, id, stage) => {
  report.applied.push({ kind, id, stage });
  checkpoint();
};
const fail = error => {
  report.status = preflightComplete ? 'partial' : 'failed';
  report.failedStage = currentStage;
  report.error = String(error);
  report.cleanupGuidance = report.applied.length
    ? '자동 롤백은 수행하지 않았습니다. Studio에서 applied 목록의 ID를 확인하고, 실제 사용 여부를 확인한 뒤 관리 화면에서 사람이 정리하세요. 배치 삭제 전 원격 적재 상태를 별도로 확인하세요.'
    : '적용된 자원이 없습니다. 원인을 해결한 뒤 다시 실행하세요.';
  try { checkpoint(); } catch (writeError) { console.error(`등록 보고서 기록 실패: ${String(writeError)}`); }
  console.error(JSON.stringify({ status: report.status, failedStage: report.failedStage, error: report.error, report: reportPath }));
};

try {
  // 쓰기 전에 capability와 실제 GET projection을 모두 검사한다. 이 블록에서는 POST를 호출하지 않는다.
  let capabilities;
  try { capabilities = await api('/api/capabilities'); }
  catch (error) { throw new Error(`등록 capability 조회에 실패해 새 계약 지원을 확인할 수 없습니다. 새 계약을 지원하는 Studio를 실행하세요. 원문: ${String(error)}`); }
  if (capabilities?.contractVersion !== 1 ||
      capabilities?.recordedModelRegistration?.deploymentInsightNotes !== true ||
      capabilities?.recordedModelRegistration?.catalogNotesPreserved !== true ||
      !endpointContract.every(endpoint => capabilities.recordedModelRegistration.endpoints?.includes(endpoint))) {
    throw new Error('Studio가 기록 모델 등록 계약 v1(배치 insightNotes·카탈로그 notes 보존 및 등록 엔드포인트)을 지원하지 않습니다. 새 계약을 지원하는 Studio를 실행하세요.');
  }
  const snapshot = await api('/api/snapshot');
  if (!hasKeys(snapshot, ['agents', 'models']) || !Array.isArray(snapshot.agents) || !Array.isArray(snapshot.models))
    throw new Error('/api/snapshot 응답 형식이 기록 모델 등록 계약과 다릅니다.');
  const deploymentList = await api('/api/model-deployments');
  if (!Array.isArray(deploymentList?.deployments) || deploymentList.deployments.some(deployment => !hasKeys(deployment, ['id', 'name', 'stages']) || deployment.insightNotes != null && typeof deployment.insightNotes !== 'string'))
    throw new Error('/api/model-deployments 응답 형식이 insightNotes 보존 계약과 다릅니다.');
  const existing = deploymentList.deployments;
  preflightComplete = true;
  report.before = { agents: snapshot.agents.length, models: snapshot.models.length, deployments: existing.length };
  checkpoint();

  const addresses = new Set(presets.flatMap(preset => [preset.ingressAddress, ...preset.stages.map(stage => stage.referenceAgent)]));
  const byAddress = new Map();
  for (const address of addresses) {
    currentStage = `에이전트 등록: ${address}`;
    const endpoint = new URL(address), host = endpoint.hostname, port = Number(endpoint.port);
    let agent = snapshot.agents.find(a => a.host === host && a.port === port)
      ?? snapshot.agents.find(a => a.host === host && a.name === hostNames[host]);
    const created = !agent;
    if (!agent) {
      agent = await api('/api/agents', { name: hostNames[host] ?? host, host, port });
      recordApplied('agent', agent.id, currentStage);
      snapshot.agents.push(agent);
    }
    byAddress.set(address, agent);
    report.agents.push({ id: agent.id, name: agent.name, referenceAddress: address, created });
    checkpoint();
  }
  for (const preset of presets) {
    const previous = existing.find(deployment => deployment.presetId === preset.id || deployment.name === preset.name);
    const placements = preset.stages.map((source, index) => {
      const options = JSON.parse(source.loadOptionsJson);
      return { id: previous?.stages[index]?.id ?? randomUUID(), agentId: byAddress.get(source.referenceAgent).id,
        nodeId: previous?.stages[index]?.nodeId ?? `${preset.id}-${randomUUID().slice(0, 8)}-${index}`,
        nodeGeneration: previous?.stages[index]?.nodeGeneration ?? 1,
        artifact: source.artifact, layerStart: source.layerStart, layerEnd: source.layerEnd,
        endpoint: options.endpoint, device: source.device,
        options: '', argsJson: JSON.stringify(options.args ?? []), environmentJson: JSON.stringify(options.environment ?? []), customPayload: '{}',
        planText: source.planText, loadOptionsJson: source.loadOptionsJson, referenceAgent: source.referenceAgent };
    });
    const first = JSON.parse(preset.stages[0].loadOptionsJson);
    const input = deploymentInputSchema.parse({ name: preset.name, adapter: preset.adapter, presetId: preset.id, insightNotes: preset.insightNotes,
      ingressAgentId: byAddress.get(preset.ingressAddress).id, totalLayers: preset.totalLayers,
      contextSize: first.context_size, sequenceCapacity: first.sequence_capacity, nBatch: first.n_batch, nUbatch: first.n_ubatch,
      timeoutMs: preset.timeoutMs, pipelineCompatibility: preset.source.pipelineCompatibility ?? 'exact-build',
      loadContentType: '', loadedContentType: '', unloadContentType: '', unloadedContentType: '', errorContentType: '', stages: placements });
    // 기존 사용자 편집은 덮어쓰지 않는다. 생성 응답의 ID는 검증 전에 즉시 보존한다.
    currentStage = `배치 등록: ${preset.id}`;
    const deployment = previous ?? await api('/api/model-deployments', input);
    if (!previous) recordApplied('deployment', deployment.id, currentStage);
    assert.equal(deployment.ingressAgentId, input.ingressAgentId);
    assert.equal(deployment.stages.length, placements.length);
    assert.equal(deployment.insightNotes, input.insightNotes);
    for (let i = 0; i < placements.length; i++) {
      assert.equal(deployment.stages[i].agentId, placements[i].agentId);
      assert.deepEqual(buildLoadPayload(deployment, deployment.stages[i], 1), buildLoadPayload(input, placements[i], 1));
    }
    let catalog = snapshot.models.find(model => model.name === preset.name);
    if (!catalog) {
      currentStage = `모델 카탈로그 등록: ${preset.id}`;
      const catalogNotes = JSON.stringify({ insightNotes: preset.insightNotes, source: preset.source.directory,
          configSha256: preset.source.configSha256, artifactSha256: preset.source.artifactSha256 });
      catalog = await api('/api/models', { name: preset.name, artifact: preset.stages[0].artifact, architecture: 'recorded',
        adapter: preset.adapter, contextLength: first.context_size,
        notes: catalogNotes });
      recordApplied('catalog', catalog.id, currentStage);
      assert.equal(catalog.notes, catalogNotes);
      snapshot.models.push(catalog);
    }
    report.models.push({ id: catalog.id, name: catalog.name });
    report.deployments.push({ id: deployment.id, name: deployment.name, stageCount: deployment.stages.length, status: deployment.status });
    checkpoint();
    console.log(JSON.stringify({ registeredModel: deployment.name, stages: deployment.stages.length, status: deployment.status }));
  }
  report.status = 'complete';
} catch (error) {
  fail(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  try { checkpoint(); } catch (error) { console.error(`등록 보고서 기록 실패: ${String(error)}`); process.exitCode = 1; }
  console.log(JSON.stringify({ status: report.status, error: report.error, report: reportPath }));
}
