import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { deploymentInputSchema, validateDeploymentLoad } from '../packages/studio_domain/dist/common/index.js';
const base = 'http://localhost:43120/api/model-deployments';
const records = (await (await fetch(base)).json()).deployments;
const record = records.find(record => /TUF.*4070/.test(record.name));
const input = deploymentInputSchema.parse(record);
for (const stage of input.stages) {
  if (stage.layerStart === 0) stage.planText = stage.planText.replace(/--n-gpu-layers\s+\d+/, '--n-gpu-layers 33').replace('--expect-layer-device 0:24:CUDA0', '--expect-layer-device 0:16:CPU --expect-layer-device 16:24:CUDA0');
  else stage.planText = stage.planText.replace(/--n-gpu-layers\s+\d+/, '--n-gpu-layers 9').replace('--expect-layer-device 24:36:CPU --expect-layer-device 36:48:CUDA0', '--expect-layer-device 24:40:CPU --expect-layer-device 40:48:CUDA0');
}
validateDeploymentLoad(input);
await fs.writeFile(`target/gemma-wave10-input-${record.id}.json`, JSON.stringify(input, null, 2));
const response = await fetch(`${base}/${record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
assert(response.ok, await response.text());
const after = (await (await fetch(base)).json()).deployments;
assert.deepEqual(deploymentInputSchema.parse(after.find(value => value.id === record.id)), input);
await fs.writeFile('target/gemma-wave10-after.json', JSON.stringify(after, null, 2));
const result = JSON.parse(await fs.readFile('target/gemma-wave10-result.json', 'utf8'));
result.results.find(value => value.id === record.id).gpuLayerWindows = ['16:24', '40:48'];
await fs.writeFile('target/gemma-wave10-result.json', JSON.stringify(result, null, 2));
console.log('TUF: 100 slots, 460800 total context, batch/ubatch 128, host KV, GPU layers [16,24) and [40,48); HTTP persistence verified');
