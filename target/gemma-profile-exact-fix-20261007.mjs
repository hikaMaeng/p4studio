import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { deploymentInputSchema, validateDeploymentLoad, readLlamaResourceProfile } from '../packages/studio_domain/dist/common/index.js';
const base = 'http://localhost:43120/api/model-deployments';
const before = (await (await fetch(base)).json()).deployments;
const probes = JSON.parse(await fs.readFile('target/gemma-mac-probes-batch128-ubatch64-20261007.json', 'utf8'));
await fs.writeFile('target/gemma-profile-exact-before-20261007.json', JSON.stringify(before, null, 2));
const results = [];
for (const record of before.filter(record => /gemma\s*4/i.test(record.name))) {
  const input = deploymentInputSchema.parse(record);
  input.nUbatch = 64;
  for (const stage of input.stages) {
    const options = JSON.parse(stage.loadOptionsJson);
    const reference = probes.find(probe => (probe.nodeId === stage.nodeId) || probe.nodeId === (stage.layerStart === 0 ? 'mac20-head' : 'mac20-tail'));
    assert.equal(options.n_batch, 128); assert.equal(options.sequence_capacity, 100);
    assert.equal(stage.layerStart, reference.memory.layer_default_devices[0].layer);
    assert.equal(stage.layerEnd - stage.layerStart, reference.memory.layer_default_devices.length);
    options.n_ubatch = 64;
    options.resource_profile.max_physical_result_bytes = reference.physicalResultBytes;
    readLlamaResourceProfile(options.resource_profile);
    assert(options.resource_profile.max_completion_payload_bytes <= 256 * 1024 * 1024);
    stage.planText = stage.planText.replace(/(--ubatch-size\s+)\d+/, (_, flag) => `${flag}64`);
    stage.loadOptionsJson = JSON.stringify(options, null, 2);
  }
  validateDeploymentLoad(input);
  const fresh = (await (await fetch(base)).json()).deployments.find(value => value.id === record.id);
  assert.equal(fresh.updatedAt, record.updatedAt, `Model changed: ${record.name}`);
  const response = await fetch(`${base}/${record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const body = await response.json();
  assert(response.ok, `${record.name}: ${JSON.stringify(body)}`);
  results.push({ id: record.id, name: record.name, saved: true, bounds: input.stages.map(stage => ({ node: stage.nodeId, physicalResultBytes: JSON.parse(stage.loadOptionsJson).resource_profile.max_physical_result_bytes })) });
}
const after = (await (await fetch(base)).json()).deployments;
for (const result of results) {
  const record = after.find(record => record.id === result.id);
  validateDeploymentLoad(record);
  assert.equal(record.sequenceCapacity, 100); assert.equal(record.nUbatch, 64);
  for (const stage of record.stages) {
    const options = JSON.parse(stage.loadOptionsJson);
    assert.equal(options.resource_profile.max_physical_result_bytes, result.bounds.find(bound => bound.node === stage.nodeId).physicalResultBytes);
    assert.equal(options.resource_profile.max_requests, 100); assert.equal(options.resource_profile.max_output_tokens, 400000);
  }
}
await fs.writeFile('target/gemma-profile-exact-after-20261007.json', JSON.stringify(after, null, 2));
await fs.writeFile('target/gemma-profile-exact-result-20261007.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
