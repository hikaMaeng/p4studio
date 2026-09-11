// Offline evidence import only. Studio has no runtime dependency on a P4 checkout.
// node scripts/import-deployment-preset.mjs <run-dir> <preset-id> <model-name> <output.ts>
import fs from 'node:fs';
import crypto from 'node:crypto';
const [directory, id, name, output] = process.argv.slice(2);
if (!output) throw new Error('Expected run directory, preset ID, model name, output TS file');
const read = name => fs.readFileSync(`${directory}/${name}`);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const configBytes = read('config.json'), artifactBytes = read('artifact.json');
const config = JSON.parse(configBytes), artifact = JSON.parse(artifactBytes);
const field = (plan, flag) => { const match = plan.match(new RegExp(`(?:^|\\s)${flag} (?:"([^"]*)"|(\\S+))`)); if (!match) throw new Error(`Missing ${flag}`); return match[1] ?? match[2]; };
const preset = {
  id, name, adapter: 'llamacpp', ingressAddress: config.ingress_agent,
  totalLayers: Number(field(config.nodes.at(-1).plan, '--layer-end')),
  timeoutMs: config.timeout_ms,
  source: { directory, configSha256: hash(configBytes), artifactSha256: hash(artifactBytes),
    build: artifact.build, pipelineCompatibility: config.pipeline_compatibility ?? null,
    passed: artifact.passed, requests: artifact.request_count, completed: artifact.completed_count,
    released: artifact.released_count, error: artifact.error ?? null,
    evidenceMissing: artifact.evidence_missing ?? null, cleanupError: artifact.cleanup_error ?? null },
  stages: config.nodes.map(node => {
    const { agent, node: nodeId, generation: _generation, plan, ...options } = node;
    // Mirror tools/event-drive/src/run/load.rs, excluding fresh command identity.
    options.ready_timeout_ms = config.timeout_ms; options.io_timeout_ms = config.timeout_ms;
    return { referenceAgent: agent, referenceNode: nodeId, artifact: field(plan, '--model'),
      layerStart: Number(field(plan, '--layer-begin')), layerEnd: Number(field(plan, '--layer-end')),
      device: field(plan, '--device'), planText: plan, loadOptionsJson: JSON.stringify(options, null, 2) };
  }),
};
fs.writeFileSync(output, `// Extracted from recorded P4 config + artifact; see scripts/import-deployment-preset.mjs.\nexport default ${JSON.stringify(preset, null, 2)};\n`);
console.log(JSON.stringify({ id, stages: preset.stages.length, agents: new Set(preset.stages.map(s => s.referenceAgent)).size, source: preset.source }));
