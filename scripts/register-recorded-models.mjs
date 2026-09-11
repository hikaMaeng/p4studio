// Explicit, repeatable registration into a running Studio through its public HTTP API.
// Usage: node scripts/register-recorded-models.mjs <studio-url> <report.json>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { deploymentPresets, deploymentInputSchema, buildLoadPayload } from '../packages/studio_domain/dist/common/index.js';
const [base, reportPath] = process.argv.slice(2);
if (!base || !reportPath) throw new Error('Specify the Studio URL and report path');
const report = { url: base, startedAt: new Date().toISOString(), status: 'running', agents: [], nodes: [], models: [], deployments: [] };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const checkpoint = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const api = async (route, body) => {
  const response = await fetch(new URL(route, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status}: ${JSON.stringify(result)}`);
  return result;
};
const hostNames = {
  '192.168.0.29': 'M42-SERVER2', '192.168.0.26': 'Spark', '192.168.0.21': 'Mac Metal',
  '192.168.0.6': 'hikaTR', '192.168.0.19': 'Ubuntu 2070',
  '10.10.10.111': 'MI250-01', '10.10.10.2': 'MI250-02',
};
try {
  let snapshot = await api('/api/snapshot'); report.before = { agents: snapshot.agents.length, nodes: snapshot.nodes.length, models: snapshot.models.length };
  const existing = (await api('/api/model-deployments')).deployments;
  const addresses = new Set(deploymentPresets.flatMap(p => [p.ingressAddress, ...p.stages.map(s => s.referenceAgent)]));
  const byAddress = new Map();
  for (const address of addresses) {
    const endpoint = new URL(address), host = endpoint.hostname, port = Number(endpoint.port);
    let agent = snapshot.agents.find(a => a.host === host && a.port === port)
      ?? snapshot.agents.find(a => a.host === host && a.name === hostNames[host]);
    const created = !agent;
    if (!agent) { agent = await api('/api/agents', { name: hostNames[host] ?? host, host, port }); snapshot.agents.push(agent); }
    else agent = await api(`/api/agents/${agent.id}/probe`, {});
    byAddress.set(address, agent);
    const activeAddress = `tcp://${agent.host}:${agent.port}`;
    report.agents.push({ id: agent.id, name: agent.name, referenceAddress: address, address: activeAddress, created, reachability: agent.reachability, inspection: agent.inspection }); checkpoint();
    console.log(JSON.stringify({ registeredAgent: agent.name, address: activeAddress, reachability: agent.reachability, inspection: agent.inspection.state }));
  }
  for (const preset of deploymentPresets) {
    const placements = [];
    for (const source of preset.stages) {
      const agent = byAddress.get(source.referenceAgent), options = JSON.parse(source.loadOptionsJson);
      let node = snapshot.nodes.find(n => n.agentId === agent.id && n.name === source.referenceNode);
      const created = !node;
      if (!node) { node = await api(`/api/agents/${agent.id}/nodes`, { name: source.referenceNode }); snapshot.nodes.push(node); }
      report.nodes.push({ id: node.id, name: node.name, agentId: agent.id, created, lifecycle: node.lifecycle }); checkpoint();
      const observed = agent.inspection.snapshot?.nodes.find(n => n.nodeId === source.referenceNode);
      if (observed && observed.adapterKind !== preset.adapter) throw new Error(`Existing node adapter differs: ${source.referenceNode}`);
      placements.push({ id: node.id, agentId: agent.id, nodeId: source.referenceNode,
        nodeGeneration: observed?.generation ?? 1, createNode: !observed,
        artifact: source.artifact, layerStart: source.layerStart, layerEnd: source.layerEnd,
        binary: options.binary, endpoint: options.endpoint, device: source.device,
        options: '', argsJson: JSON.stringify(options.args), environmentJson: JSON.stringify(options.environment), customPayload: '{}',
        planText: source.planText, loadOptionsJson: source.loadOptionsJson, referenceAgent: source.referenceAgent });
    }
    const first = JSON.parse(preset.stages[0].loadOptionsJson);
    let catalog = snapshot.models.find(m => m.name === preset.name);
    if (!catalog) {
      catalog = await api('/api/models', { name: preset.name, artifact: preset.stages[0].artifact,
        architecture: preset.id.startsWith('hy3') ? 'hy_v3' : 'step35', adapter: preset.adapter, contextLength: first.context_size,
        notes: JSON.stringify({ source: preset.source.directory, configSha256: preset.source.configSha256, artifactSha256: preset.source.artifactSha256, recordedPassed: preset.source.passed, recordedCompleted: preset.source.completed, recordedRequests: preset.source.requests }) });
      snapshot.models.push(catalog);
    }
    report.models.push({ id: catalog.id, name: catalog.name }); checkpoint();
    const input = deploymentInputSchema.parse({ name: preset.name, adapter: preset.adapter, presetId: preset.id,
      ingressAgentId: byAddress.get(preset.ingressAddress).id, totalLayers: preset.totalLayers,
      contextSize: first.context_size, sequenceCapacity: first.sequence_capacity, nBatch: first.n_batch, nUbatch: first.n_ubatch,
      timeoutMs: preset.timeoutMs, pipelineCompatibility: preset.source.pipelineCompatibility ?? 'exact-build',
      loadContentType: '', loadedContentType: '', unloadContentType: '', unloadedContentType: '', errorContentType: '', stages: placements });
    let deployment = existing.find(d => d.presetId === preset.id || d.name === preset.name);
    if (!deployment) { deployment = await api('/api/model-deployments', input); existing.push(deployment); }
    // Do not overwrite an existing user-edited deployment; fail with preserved evidence if it differs.
    assert.equal(deployment.ingressAgentId, input.ingressAgentId);
    assert.equal(deployment.stages.length, placements.length);
    for (let i = 0; i < placements.length; i++) {
      const saved = deployment.stages[i], expected = placements[i];
      assert.equal(saved.agentId, expected.agentId); assert.equal(saved.nodeId, expected.nodeId); assert.equal(saved.id, expected.id);
      assert.deepEqual(buildLoadPayload(deployment, saved, 1), buildLoadPayload(input, expected, 1));
    }
    report.deployments.push({ id: deployment.id, name: deployment.name, stageCount: deployment.stages.length, status: deployment.status }); checkpoint();
    console.log(JSON.stringify({ registeredModel: deployment.name, nodes: deployment.stages.length, status: deployment.status }));
  }
  snapshot = await api('/api/snapshot');
  report.after = { agents: snapshot.agents.length, nodes: snapshot.nodes.length, models: snapshot.models.length, deployments: (await api('/api/model-deployments')).deployments.length };
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); checkpoint(); console.log(JSON.stringify({ status: report.status, after: report.after, error: report.error, report: reportPath })); }
