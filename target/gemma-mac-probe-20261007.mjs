import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const records = (await (await fetch('http://localhost:43120/api/model-deployments')).json()).deployments.filter(record => /Mac2[01]/.test(record.name));
const probes = [];
const batch = Number(process.argv[2] ?? 128);
const ubatch = Number(process.argv[3] ?? batch);
for (const record of records) {
  const host = /Mac20/.test(record.name) ? '192.168.0.20' : '192.168.0.21';
  for (const stage of record.stages) {
    const planText = stage.planText.replace(/(--batch-size\s+)\d+/, (_, flag) => `${flag}${batch}`).replace(/(--ubatch-size\s+)\d+/, (_, flag) => `${flag}${ubatch}`);
    const plan = Buffer.from(planText), input = Buffer.alloc(plan.length + 4);
    input.writeUInt32LE(plan.length); plan.copy(input, 4);
    const result = await new Promise((resolve, reject) => {
      const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', `mobimac@${host}`, 'cd /Users/mobimac/p4-agent-current && DYLD_LIBRARY_PATH=. ./p4_staged_server --port 24110 --inspect-memory-plan'], { windowsHide: true });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Native memory inspection timeout')); }, 90000);
      child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
      child.once('error', reject); child.once('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      child.stdin.end(input);
    });
    await fs.writeFile(`target/gemma-mac-probe-${stage.nodeId}-batch${batch}-20261007.log`, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.code, 0, result.stderr.slice(-1500));
    const line = result.stderr.split('\n').find(line => line.startsWith('MEMORY_PLAN '));
    assert(line, 'Native returned no memory plan');
    const memory = JSON.parse(line.slice(12));
    probes.push({ modelId: record.id, stageId: stage.id, nodeId: stage.nodeId, planText, physicalResultBytes: memory.max_physical_result_bytes, memory });
    console.log(JSON.stringify({ node: stage.nodeId, exactPhysicalResultBytes: memory.max_physical_result_bytes, shape: memory.execution_shape, memory: memory.entries }));
  }
}
await fs.writeFile(`target/gemma-mac-probes-batch${batch}-ubatch${ubatch}-20261007.json`, JSON.stringify(probes, null, 2));
