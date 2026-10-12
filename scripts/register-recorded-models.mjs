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
const report = { url: base, startedAt: new Date().toISOString(), status: 'running', agents: [], models: [], deployments: [] };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const checkpoint = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const api = async (route, body) => {
  const response = await fetch(new URL(route, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status}: ${JSON.stringify(result)}`);
  return result;
};
const hostNames = { '192.168.0.29': 'M42-SERVER2', '192.168.0.26': 'Spark', '192.168.0.21': 'Mac21',
  '192.168.0.20': 'Mac20', '192.168.0.22': 'GB10', '192.168.0.6': 'hikaTR', '192.168.0.19': 'Ubuntu 2070',
  '10.10.10.111': 'MI250-01', '10.10.10.2': 'MI250-02' };
try {
  const snapshot = await api('/api/snapshot');
  report.before = { agents: snapshot.agents.length, models: snapshot.models.length };
  const existing = (await api('/api/model-deployments')).deployments;
  const addresses = new Set(presets.flatMap(preset => [preset.ingressAddress, ...preset.stages.map(stage => stage.referenceAgent)]));
  const byAddress = new Map();
  for (const address of addresses) {
    const endpoint = new URL(address), host = endpoint.hostname, port = Number(endpoint.port);
    let agent = snapshot.agents.find(a => a.host === host && a.port === port)
      ?? snapshot.agents.find(a => a.host === host && a.name === hostNames[host]);
    const created = !agent;
    if (!agent) { agent = await api('/api/agents', { name: hostNames[host] ?? host, host, port }); snapshot.agents.push(agent); }
    byAddress.set(address, agent);
    report.agents.push({ id: agent.id, name: agent.name, referenceAddress: address, created }); checkpoint();
  }
  for (const preset of presets) {
    const previous = existing.find(deployment => deployment.presetId === preset.id || deployment.name === preset.name);
    const placements = preset.stages.map((source, index) => {
      const options = JSON.parse(source.loadOptionsJson);
      return { id: previous?.stages[index]?.id ?? randomUUID(), agentId: byAddress.get(source.referenceAgent).id,
        nodeId: previous?.stages[index]?.nodeId ?? `${preset.id}-${randomUUID().slice(0, 8)}-${index}`,
        nodeGeneration: previous?.stages[index]?.nodeGeneration ?? 1,
        artifact: source.artifact, layerStart: source.layerStart, layerEnd: source.layerEnd,
        binary: options.binary, endpoint: options.endpoint, device: source.device,
        options: '', argsJson: JSON.stringify(options.args ?? []), environmentJson: JSON.stringify(options.environment ?? []), customPayload: '{}',
        planText: source.planText, loadOptionsJson: source.loadOptionsJson, referenceAgent: source.referenceAgent };
    });
    const first = JSON.parse(preset.stages[0].loadOptionsJson);
    const input = deploymentInputSchema.parse({ name: preset.name, adapter: preset.adapter, presetId: preset.id, insightNotes: preset.insightNotes,
      ingressAgentId: byAddress.get(preset.ingressAddress).id, totalLayers: preset.totalLayers,
      contextSize: first.context_size, sequenceCapacity: first.sequence_capacity, nBatch: first.n_batch, nUbatch: first.n_ubatch,
      timeoutMs: preset.timeoutMs, pipelineCompatibility: preset.source.pipelineCompatibility ?? 'exact-build',
      loadContentType: '', loadedContentType: '', unloadContentType: '', unloadedContentType: '', errorContentType: '', stages: placements });
    // 기존 사용자 편집은 덮어쓰지 않는다. 검증 실패도 보고에 보존한다.
    const deployment = previous ?? await api('/api/model-deployments', input);
    assert.equal(deployment.ingressAgentId, input.ingressAgentId);
    assert.equal(deployment.stages.length, placements.length);
    assert.equal(deployment.insightNotes, input.insightNotes);
    for (let i = 0; i < placements.length; i++) {
      assert.equal(deployment.stages[i].agentId, placements[i].agentId);
      assert.deepEqual(buildLoadPayload(deployment, deployment.stages[i], 1), buildLoadPayload(input, placements[i], 1));
    }
    let catalog = snapshot.models.find(model => model.name === preset.name);
    if (!catalog) { catalog = await api('/api/models', { name: preset.name, artifact: preset.stages[0].artifact, architecture: 'recorded',
      adapter: preset.adapter, contextLength: first.context_size,
      notes: JSON.stringify({ insightNotes: preset.insightNotes, source: preset.source.directory,
        configSha256: preset.source.configSha256, artifactSha256: preset.source.artifactSha256 }) }); snapshot.models.push(catalog); }
    report.models.push({ id: catalog.id, name: catalog.name });
    report.deployments.push({ id: deployment.id, name: deployment.name, stageCount: deployment.stages.length, status: deployment.status }); checkpoint();
    console.log(JSON.stringify({ registeredModel: deployment.name, stages: deployment.stages.length, status: deployment.status }));
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); checkpoint(); console.log(JSON.stringify({ status: report.status, error: report.error, report: reportPath })); }
