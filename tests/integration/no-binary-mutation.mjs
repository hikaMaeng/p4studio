import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// 제품 소스·dist는 읽기만 한다. 동일 회귀 시험을 TEMP의 독립 dist에 연결한다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "tests/reports/no-binary/mutation");
mkdirSync(out, { recursive: true });
const temporary = mkdtempSync(path.join(tmpdir(), "studio-no-binary-mutation-"));
symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "junction");
const source = path.join(root, "packages/studio_domain/dist"), copy = path.join(temporary, "domain");
cpSync(source, copy, { recursive: true });
const payloadPath = "common/protocol/deployments/payload.js";
const original = readFileSync(path.join(source, payloadPath), "utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
let test = readFileSync(path.join(root, "packages/studio_domain/src/server/deployments/no-binary.test.ts"), "utf8");
test = test.replaceAll('"../../common/', '"./domain/common/').replaceAll('"../../front/', '"./domain/front/');
writeFileSync(path.join(temporary, "no-binary.test.ts"), test);
writeFileSync(path.join(temporary, "vitest.config.mjs"), 'export default { test: { include: ["no-binary.test.ts"], maxWorkers: 33 } };\n');
const run = name => {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.config.mjs"],
    { cwd: temporary, encoding: "utf8", windowsHide: true });
  writeFileSync(path.join(out, `${name}.log`), result.stdout + result.stderr);
  return { exitCode: result.status, output: result.stdout + result.stderr };
};
const control = run("control");
assert.equal(control.exitCode, 0, control.output);
const changes = [
  { name: "text", from: "    return payload;", to: '    payload.binary = "mutant.exe";\n    return payload;' },
  { name: "legacy", from: "return { load_generation: generation, endpoint: stage.endpoint,", to: 'return { load_generation: generation, binary: "mutant.exe", endpoint: stage.endpoint,' },
];
const results = [];
for (const change of changes) {
  assert.equal(original.split(change.from).length, 2, "변이 대상은 정확히 한 곳이어야 한다");
  writeFileSync(path.join(copy, payloadPath), original.replace(change.from, change.to));
  const mutant = run(change.name);
  assert.equal(mutant.exitCode, 1, mutant.output);
  assert.match(mutant.output, /LOAD의 구형 폼과 JSON 경로 모두 binary를 보내지 않는다/);
  assert.match(mutant.output, /binary/);
  results.push({ 경로: change.name, 종료코드: mutant.exitCode, 결과: "binary 재전송 변이 검출" });
}
assert.equal(hash(readFileSync(path.join(source, payloadPath))), hash(original), "제품 dist는 변경하면 안 된다");
const report = { 결과: "통과", temporary, 대조군종료코드: control.exitCode, 변이: results,
  원본Sha256: hash(original), 제품변경없음: true, 범위: "독립 TEMP 복사본의 동일 회귀 시험" };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
