import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = mkdtempSync(path.join(tmpdir(), "studio-no-binary-preset-"));
const config = JSON.stringify({ ingress_agent: "tcp://127.0.0.1:59991", timeout_ms: 1000,
  nodes: [{ agent: "tcp://127.0.0.1:59991", node: "old", generation: 1, binary: "C:\\old\\native.exe", endpoint: "127.0.0.1:53300",
    plan: '--model "S:\\models\\model.gguf" --layer-begin 0 --layer-end 1 --device CPU', args: [], environment: [], future_option: { kept: true } }] });
const artifact = JSON.stringify({ passed: true, request_count: 1, completed_count: 1, released_count: 1, build: { pin: "fixture" } });
writeFileSync(path.join(temporary, "config.json"), config); writeFileSync(path.join(temporary, "artifact.json"), artifact);
const output = path.join(temporary, "preset.ts");
const result = spawnSync(process.execPath, [path.join(root, "scripts/import-deployment-preset.mjs"), temporary, "fixture", "옛 증거 구성", output], { encoding: "utf8", windowsHide: true });
assert.equal(result.status, 0, result.stdout + result.stderr);
const preset = JSON.parse(readFileSync(output, "utf8").split("export default ")[1].trim().replace(/;$/, ""));
const options = JSON.parse(preset.stages[0].loadOptionsJson);
assert(!Object.hasOwn(options, "binary")); assert.deepEqual(options.future_option, { kept: true });
const hash = value => createHash("sha256").update(value).digest("hex");
assert.equal(preset.source.configSha256, hash(config)); assert.equal(preset.source.artifactSha256, hash(artifact));
assert.equal(readFileSync(path.join(temporary, "config.json"), "utf8"), config);
const out = path.join(root, "tests/reports/no-binary"); mkdirSync(out, { recursive: true });
const report = { 결과: "통과", temporary, 검증: "과거 config에서 binary를 제외한 프리셋 생성·다른 옵션 보존·원본 SHA와 파일 유지" };
writeFileSync(path.join(out, "preset-import.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
