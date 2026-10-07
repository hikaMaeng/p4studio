import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const records = JSON.parse(await fs.readFile('target/gemma-wave10-after.json', 'utf8'));
const laptop = records.find(record => /TUF/.test(record.name));
const local = records.find(record => /HIKATR RTX 3090/.test(record.name));
const localOptions = JSON.parse(local.stages[0].loadOptionsJson);
const results = [];
for (const stage of laptop.stages) {
  // Shape estimate on local CUDA; this does not prove remote 4070 memory fit.
  let plan = stage.planText.replace(/--model\s+\S+/, `--model ${local.stages[0].artifact}`);
  if (stage.layerStart === 0) plan = plan.replace(/--n-gpu-layers\s+\d+/, '--n-gpu-layers 33').replace('--expect-layer-device 0:24:CUDA0', '--expect-layer-device 0:16:CPU --expect-layer-device 16:24:CUDA0');
  else plan = plan.replace(/--n-gpu-layers\s+\d+/, '--n-gpu-layers 9').replace('--expect-layer-device 24:36:CPU --expect-layer-device 36:48:CUDA0', '--expect-layer-device 24:40:CPU --expect-layer-device 40:48:CUDA0');
  const bytes = Buffer.from(plan), input = Buffer.alloc(4 + bytes.length);
  input.writeUInt32LE(bytes.length); bytes.copy(input, 4);
  const probe = spawnSync(localOptions.binary, ['--port', '24110', '--inspect-memory-plan'], { input, env: { ...process.env, ...Object.fromEntries(localOptions.environment) }, encoding: 'utf8', timeout: 120000, windowsHide: true });
  await fs.writeFile(`target/gemma-wave10-laptop-shape-${stage.nodeId}.log`, `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`);
  assert.equal(probe.status, 0, probe.stderr?.slice(-1000));
  const memory = JSON.parse(probe.stderr.split('\n').find(line => line.startsWith('MEMORY_PLAN ')).slice(12));
  results.push({ node: stage.nodeId, shape: memory.execution_shape, entries: memory.entries });
}
const deviceBytes = results.flatMap(result => result.entries).filter(entry => entry.scope === 'device').reduce((sum, entry) => sum + entry.required, 0);
console.log(JSON.stringify({ kind: 'local CUDA estimate; remote TUF unverified', deviceBytes, results }, null, 2));
await fs.writeFile('target/gemma-wave10-laptop-shape.json', JSON.stringify({ kind: 'local CUDA estimate; remote TUF unverified', deviceBytes, results }, null, 2));
