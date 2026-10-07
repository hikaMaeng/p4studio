import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { deploymentInputSchema, validateDeploymentLoad, buildLoadPayload, llamaDispatchLimits, nodeAllocation, readLlamaResourceProfile } from '../packages/studio_domain/dist/common/index.js';

const base = 'http://localhost:43120/api/model-deployments';
const read = async () => {
  const response = await fetch(base);
  assert(response.ok, `HTTP ${response.status}`);
  return (await response.json()).deployments;
};
const gemma4 = record => /gemma[\s_-]*4/i.test(record.name) || record.stages.some(stage => /gemma[\s_-]*4/i.test(stage.artifact));
const before = await read();
await fs.writeFile('target/gemma-all-before-20261007.json', JSON.stringify(before, null, 2));
const targets = before.filter(gemma4);
assert(targets.length > 0, 'No Gemma 4 deployments found');
const results = [];
for (const original of targets) {
  const input = deploymentInputSchema.parse(original);
  const context = Math.max(4608, input.contextSize, ...input.stages.map(stage => JSON.parse(stage.loadOptionsJson).context_size));
  Object.assign(input, { sequenceCapacity: 100, contextSize: context, nBatch: 128, nUbatch: 128, timeoutMs: 21600000 });
  for (const stage of input.stages) {
    const options = JSON.parse(stage.loadOptionsJson);
    Object.assign(options, { sequence_capacity: 100, context_size: context, total_context_size: context * 100, n_batch: 128, n_ubatch: 128, ready_timeout_ms: 21600000, io_timeout_ms: 21600000 });
    stage.planText = stage.planText.replace(/(--n-seq-max\s+)\d+/, (_, flag) => `${flag}100`).replace(/(--ctx-size\s+)\d+/, (_, flag) => `${flag}${context * 100}`).replace(/(--batch-size\s+)\d+/, (_, flag) => `${flag}128`).replace(/(--ubatch-size\s+)\d+/, (_, flag) => `${flag}128`);
    const profile = options.resource_profile;
    Object.assign(profile, { max_requests: 100, max_output_tokens_per_request: 4000, max_output_tokens: 400000, outer_token_issue_window: 100 });
    profile.max_input_tokens = Math.max(profile.max_input_tokens, context * 100);
    profile.max_physical_result_bytes = Math.max(profile.max_physical_result_bytes, stage.layerEnd === input.totalLayers ? 8388608 : 260000000);
    profile.max_completion_payload_bytes = Math.max(profile.max_completion_payload_bytes, profile.max_physical_result_bytes + 1048576);
    profile.max_completion_retained_bytes = Math.max(profile.max_completion_retained_bytes, profile.max_completion_payload_bytes + 1048576);
    profile.max_edge_retained_bytes = Math.max(profile.max_edge_retained_bytes, profile.max_completion_payload_bytes);
    readLlamaResourceProfile(profile);
    const previousOptions = JSON.parse(stage.loadOptionsJson);
    // Preserve formatting for already-correct records and avoid needless edits.
    if (JSON.stringify(previousOptions) !== JSON.stringify(options)) stage.loadOptionsJson = JSON.stringify(options, null, 2);
  }
  validateDeploymentLoad(input);
  const changed = JSON.stringify(input) !== JSON.stringify(deploymentInputSchema.parse(original));
  if (changed) {
    const current = (await read()).find(record => record.id === original.id);
    assert.equal(current.updatedAt, original.updatedAt, `Concurrent edit: ${original.name}`);
    const response = await fetch(`${base}/${original.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json();
    assert(response.ok, `${original.name}: HTTP ${response.status}: ${JSON.stringify(body)}`);
    console.log(`UPDATED ${original.name}`);
  }
  results.push({ id: original.id, name: original.name, changed });
}
const after = await read();
assert.equal(after.filter(gemma4).length, targets.length, 'Gemma model set changed');
for (const record of after.filter(gemma4)) {
  validateDeploymentLoad(record);
  assert.equal(record.sequenceCapacity, 100);
  assert(record.contextSize >= 4608);
  assert.equal(record.nBatch, 128); assert.equal(record.nUbatch, 128);
  const limits = llamaDispatchLimits(record.stages);
  assert.equal(limits.maxRequests, 100);
  assert.equal(limits.maxOutputTokensPerRequest, 4000);
  assert.equal(limits.maxOutputTokens, 400000);
  for (const stage of record.stages) {
    const load = buildLoadPayload(record, stage, Math.max(1, record.loadGeneration));
    assert.equal(load.sequence_capacity, 100);
    assert.equal(load.total_context_size, load.context_size * 100);
    assert(load.context_size >= 4608);
    assert.equal(load.n_batch, 128); assert.equal(load.n_ubatch, 128);
    assert(load.plan.includes('--n-seq-max 100'));
    assert(load.plan.includes(`--ctx-size ${load.total_context_size}`));
    assert.equal(readLlamaResourceProfile(load.resource_profile).outer_token_issue_window, 100);
    nodeAllocation(record, stage);
  }
  Object.assign(results.find(result => result.id === record.id), { verified: true, stageCount: record.stages.length, sequenceCapacity: record.sequenceCapacity, contextSize: record.contextSize, maxRequests: limits.maxRequests, maxOutputTokens: limits.maxOutputTokens, status: record.status });
}
for (const record of before.filter(record => !gemma4(record))) assert.deepEqual(after.find(current => current.id === record.id), record);
await fs.writeFile('target/gemma-all-after-20261007.json', JSON.stringify(after, null, 2));
const summary = { checkedAt: new Date().toISOString(), allVerified: results.every(result => result.verified), modelCount: targets.length, stageCount: targets.reduce((sum, record) => sum + record.stages.length, 0), test: { concurrency: 10, waves: 10, intervalMs: 10000, maxTokens: 4000, prompt: '타입스크립트에 대해 설명하라' }, results };
await fs.writeFile('target/gemma-all-result-20261007.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
