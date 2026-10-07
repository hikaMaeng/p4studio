import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deploymentInputSchema, validateDeploymentLoad, buildLoadPayload, llamaDispatchLimits, nodeAllocation, readLlamaResourceProfile } from '../packages/studio_domain/dist/common/index.js';

const base = 'http://localhost:43120';
const read = async () => {
  const response = await fetch(`${base}/api/model-deployments`);
  if (!response.ok) throw new Error(`GET failed: ${response.status}`);
  return (await response.json()).deployments;
};
const before = await read();
await fs.writeFile('target/gemma-wave10-before-overlap.json', JSON.stringify(before, null, 2));
const results = [];
for (const original of before.filter(record => /gemma.*12b/i.test(record.name))) {
  const input = deploymentInputSchema.parse(original);
  const slots = 100;
  const context = Math.max(4608, ...input.stages.map(stage => JSON.parse(stage.loadOptionsJson).context_size));
  input.contextSize = context;
  input.sequenceCapacity = slots;
  input.nBatch = 128;
  input.nUbatch = 128;
  input.timeoutMs = 21_600_000;
  for (const stage of input.stages) {
    const options = JSON.parse(stage.loadOptionsJson);
    const changedSlots = options.sequence_capacity !== slots;
    options.sequence_capacity = slots;
    options.context_size = context;
    options.total_context_size = context * slots;
    options.ready_timeout_ms = input.timeoutMs;
    options.io_timeout_ms = input.timeoutMs;
    options.n_batch = 128;
    options.n_ubatch = 128;
    stage.planText = stage.planText.replace(/(--n-seq-max\s+)\d+/, `$1${slots}`).replace(/(--ctx-size\s+)\d+/, `$1${context * slots}`);
    stage.planText = stage.planText.replace(/(--batch-size\s+)\d+/, '$1128').replace(/(--ubatch-size\s+)\d+/, '$1128');
    // A full 100-request KV reservation exceeds the single 3090/laptop
    // device budget. Keep weights placed as before; move head KV on the
    // single 3090, and both stages' KV on the laptop, to host memory.
    if (/TUF/i.test(original.name) || /HIKATR RTX 3090/i.test(original.name) && stage.layerStart === 0) {
      stage.planText = stage.planText.replace(/--kv-offload\b/g, '--no-kv-offload');
    }
    const profile = options.resource_profile;
    profile.max_requests = 100;
    profile.max_output_tokens_per_request = 4000;
    profile.max_output_tokens = 400000;
    profile.max_input_tokens = Math.max(profile.max_input_tokens, context * 100);
    profile.outer_token_issue_window = Math.max(profile.outer_token_issue_window, slots);
    // Physical-v4 result bounds also include sequence owner metadata. Retain
    // the existing measured capsule bound and allow room for the added owners.
    if (changedSlots) profile.max_physical_result_bytes += 1_048_576;
    profile.max_physical_result_bytes = Math.max(profile.max_physical_result_bytes, stage.layerEnd === input.totalLayers ? 8_388_608 : 260_000_000);
    profile.max_completion_payload_bytes = Math.max(profile.max_completion_payload_bytes, profile.max_physical_result_bytes + 1_048_576);
    profile.max_completion_retained_bytes = Math.max(profile.max_completion_retained_bytes, profile.max_completion_payload_bytes + 1_048_576);
    profile.max_edge_retained_bytes = Math.max(profile.max_edge_retained_bytes, profile.max_completion_payload_bytes);
    readLlamaResourceProfile(profile);
    stage.loadOptionsJson = JSON.stringify(options, null, 2);
  }
  validateDeploymentLoad(input);
  const limits = llamaDispatchLimits(input.stages);
  assert(limits.maxRequests >= 100 && limits.maxOutputTokens >= 400000 && limits.maxOutputTokensPerRequest >= 4000);
  for (const stage of input.stages) {
    const payload = buildLoadPayload(input, stage, Math.max(1, original.loadGeneration));
    assert.equal(payload.sequence_capacity, slots);
    assert.equal(payload.total_context_size, context * slots);
    assert(payload.plan.includes(`--n-seq-max ${slots}`) && payload.plan.includes(`--ctx-size ${context * slots}`));
    nodeAllocation({ ...original, ...input }, stage);
  }
  await fs.writeFile(`target/gemma-wave10-input-${original.id}.json`, JSON.stringify(input, null, 2));
  if (/HIKATR RTX 3090/i.test(original.name)) {
    for (const stage of input.stages) {
      const options = JSON.parse(stage.loadOptionsJson);
      const bytes = Buffer.from(stage.planText);
      const framed = Buffer.alloc(4 + bytes.length);
      framed.writeUInt32LE(bytes.length); bytes.copy(framed, 4);
      const probe = spawnSync(options.binary, ['--port', '24110', '--inspect-memory-plan'], { input: framed, env: { ...process.env, ...Object.fromEntries(options.environment), P4_STAGED_SERVER_LAUNCH_ID: 'gemma-wave10-memory-only' }, encoding: 'utf8', timeout: 120000, windowsHide: true });
      await fs.writeFile(`target/gemma-wave10-memory-${stage.nodeId}.log`, `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`);
      const line = probe.stderr?.split('\n').find(line => line.startsWith('MEMORY_PLAN '));
      assert.equal(probe.status, 0, `Memory preflight failed: ${stage.nodeId}: ${probe.stderr?.slice(-1500)}`);
      assert(line, 'Missing native memory plan');
      const memory = JSON.parse(line.slice('MEMORY_PLAN '.length));
      assert(memory.complete && memory.fits_current_free);
      assert.equal(memory.execution_shape.n_seq_max, 100);
      console.log(JSON.stringify({ node: stage.nodeId, memoryShape: memory.execution_shape, memory: memory.entries }));
    }
  }
  // Avoid overwriting an operation or an edit that started after the snapshot.
  const current = (await read()).find(record => record.id === original.id);
  assert.equal(current.updatedAt, original.updatedAt, `Model changed: ${original.name}`);
  const response = await fetch(`${base}/api/model-deployments/${original.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const result = await response.json();
  results.push({ id: original.id, name: original.name, applied: response.ok, httpStatus: response.status, slots, context, totalContext: context * slots, nBatch: 128, nUbatch: 128, hostKvStages: input.stages.filter(stage => stage.planText.includes('--no-kv-offload')).map(stage => stage.nodeId), maxRequests: 100, maxOutputTokens: 400000, error: response.ok ? null : result.error });
}
const after = await read();
await fs.writeFile('target/gemma-wave10-after.json', JSON.stringify(after, null, 2));
for (const result of results.filter(result => result.applied)) {
  const record = after.find(record => record.id === result.id);
  validateDeploymentLoad(record);
  assert.equal(record.sequenceCapacity, result.slots);
  assert.equal(record.contextSize, result.context);
  assert.equal(record.timeoutMs, 21_600_000);
  for (const stage of record.stages) {
    const profile = JSON.parse(stage.loadOptionsJson).resource_profile;
    assert.equal(profile.max_requests, 100);
    assert.equal(profile.max_output_tokens, 400000);
  }
}
for (const original of before.filter(record => !/gemma.*12b/i.test(record.name))) assert.deepEqual(after.find(record => record.id === original.id), original);
await fs.writeFile('target/gemma-wave10-result.json', JSON.stringify({ prompt: '타입스크립트에 대해 설명하라', concurrency: 10, waves: 10, intervalMs: 10000, maxTokens: 4000, results }, null, 2));
console.log(JSON.stringify(results, null, 2));
