import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

// npm run build 이후 실행한다. 제품 소스·dist는 읽기만 하고 변이는 TEMP 복사본에 적용한다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outIndex = process.argv.indexOf("--out");
const out = path.resolve(outIndex < 0 ? path.join(root, "tests/reports/studio-revamp/mutation") : process.argv[outIndex + 1]);
mkdirSync(out, { recursive: true });
const temporary = mkdtempSync(path.join(tmpdir(), "studio-revamp-mutation-"));
symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "junction");
const source = path.join(root, "packages/studio_domain/dist");
const copy = path.join(temporary, "domain");
cpSync(source, copy, { recursive: true });
const observationPath = "front/model/inference/observability.js";
const hash = value => createHash("sha256").update(value).digest("hex");
const original = readFileSync(path.join(source, observationPath), "utf8");
const config = path.join(temporary, "vitest.config.mjs");
writeFileSync(config, `export default ${JSON.stringify({
  resolve: { alias: {
    "@p4studio/studio_domain/front": path.join(copy, "front/index.js"),
    "@p4studio/studio_domain/common": path.join(copy, "common/index.js"),
  } },
  test: { include: ["src/**/*.test.ts"] },
})};\n`);
const run = name => {
  const result = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run",
    "src/front/features/inference/api.test.ts", "-t", "A2 실제 BatchObservation", "--config", config],
  { cwd: path.join(root, "apps/studio"), encoding: "utf8", windowsHide: true });
  writeFileSync(path.join(out, `${name}.log`), result.stdout + result.stderr);
  return { exitCode: result.status, signal: result.signal, output: result.stdout + result.stderr };
};
const control = run("control");
assert.equal(control.exitCode, 0, control.output);
const call = "    addBatchRequestDistributions(run.batchRequestDistributions ??= emptyBatchRequestDistributions(), value);";
assert.equal(original.split(call).length, 2, "삭제할 호출이 정확히 하나여야 한다");
writeFileSync(path.join(copy, observationPath), original.replace(call, "    // 변이: 실제 수신 분포 누적 호출 제거"));
const mutant = run("mutant");
assert.equal(mutant.exitCode, 1, mutant.output);
assert.match(mutant.output, /A2 실제 BatchObservation/);
assert.match(mutant.output, /expected undefined to deeply equal/);
assert.equal(hash(readFileSync(path.join(source, observationPath))), hash(original), "제품 dist를 수정하지 않아야 한다");
const report = { status: "검출", temporary, test: "A2 실제 BatchObservation 수신→중복 제거→run 누적→저장→복원",
  controlExitCode: control.exitCode, mutantExitCode: mutant.exitCode,
  mutation: "TEMP에 복사한 도메인 dist의 addBatchRequestDistributions 호출 한 줄 제거",
  originalSha256: hash(original), productUnchanged: true };
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
