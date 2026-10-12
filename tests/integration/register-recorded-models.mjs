import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportIndex = process.argv.indexOf('--out');
const out = path.resolve(reportIndex < 0 ? path.join(root, 'tests/reports/studio-revamp/r3') : process.argv[reportIndex + 1]);
mkdirSync(out, { recursive: true });
const temporary = path.join(tmpdir(), `studio-revamp-registration-${randomUUID()}`);
mkdirSync(path.join(temporary, 'scripts'), { recursive: true });
mkdirSync(path.join(temporary, 'packages', 'studio_domain'), { recursive: true });
symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'junction');
symlinkSync(path.join(root, 'packages', 'studio_domain', 'dist'), path.join(temporary, 'packages', 'studio_domain', 'dist'), 'junction');
const originalScript = readFileSync(path.join(root, 'scripts/register-recorded-models.mjs'), 'utf8');
const scriptPath = path.join(temporary, 'scripts/register-recorded-models.mjs');
writeFileSync(scriptPath, originalScript);

function fakeStudio({ compatible = true, capabilityEndpoint = true, failCatalog = false } = {}) {
  const state = { posts: 0, agents: [], deployments: [], models: [], failCatalog };
  const capabilities = { contractVersion: 1, recordedModelRegistration: {
    deploymentInsightNotes: true, catalogNotesPreserved: true,
    endpoints: ['GET /api/snapshot', 'GET /api/model-deployments', 'POST /api/agents', 'POST /api/model-deployments', 'POST /api/models'],
  } };
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (request.method === 'GET' && request.url === '/api/capabilities') return capabilityEndpoint
      ? send(200, compatible ? capabilities : { contractVersion: 0 }) : send(404, { error: 'not found' });
    if (request.method === 'GET' && request.url === '/api/snapshot') return send(200, { agents: state.agents, models: state.models });
    if (request.method === 'GET' && request.url === '/api/model-deployments') return send(200, { deployments: state.deployments });
    if (request.method !== 'POST') return send(404, { error: 'not found' });
    state.posts++;
    if (request.url === '/api/agents') {
      let agent = state.agents.find(value => value.host === body.host && value.port === body.port);
      if (!agent) { agent = { ...body, id: randomUUID() }; state.agents.push(agent); }
      return send(201, agent);
    }
    if (request.url === '/api/model-deployments') {
      const deployment = { ...body, id: randomUUID(), status: 'draft' };
      state.deployments.push(deployment);
      return send(201, deployment);
    }
    if (request.url === '/api/models') {
      if (state.failCatalog) { state.failCatalog = false; return send(500, { error: 'fixture catalog failure' }); }
      const model = { ...body, id: randomUUID() };
      state.models.push(model);
      return send(201, model);
    }
    return send(404, { error: 'not found' });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({ state, url: `http://127.0.0.1:${address.port}/`, close: () => new Promise(done => server.close(done)) });
  }));
}

const run = async (url, name, script = scriptPath) => {
  const reportPath = path.join(out, `${name}.json`);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [script, url, reportPath, 'qwen38-none-seq16'], { cwd: temporary, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout, stderr }));
  });
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, report, reportPath };
};

const evidence = {};
{
  const studio = await fakeStudio({ compatible: false, capabilityEndpoint: false });
  const result = await run(studio.url, 'a-구버전');
  assert.notEqual(result.exitCode, 0);
  assert.equal(studio.state.posts, 0, '사전 검사에서 POST를 호출하지 않아야 한다');
  assert.match(result.stderr, /새 계약을 지원하는 Studio/);
  assert.equal(result.report.status, 'failed');
  assert.deepEqual(result.report.applied, []);
  evidence.a = { 종료코드: result.exitCode, POST횟수: studio.state.posts, 보고서상태: result.report.status, stderr포함: '새 계약 미지원' };
  await studio.close();
}
{
  const studio = await fakeStudio({ failCatalog: true });
  const result = await run(studio.url, 'b-카탈로그-500');
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.failedStage, '모델 카탈로그 등록: qwen38-none-seq16');
  assert.match(result.report.error, /fixture catalog failure/);
  assert.ok(result.report.applied.some(item => item.kind === 'agent' && item.id));
  assert.ok(result.report.applied.some(item => item.kind === 'deployment' && item.id));
  evidence.b = { 종료코드: result.exitCode, 보고서상태: result.report.status, 실패단계: result.report.failedStage,
    applied종류: result.report.applied.map(item => item.kind), 오류원문보존: result.report.error };
  await studio.close();
}
{
  const studio = await fakeStudio();
  const first = await run(studio.url, 'c-정상');
  assert.equal(first.exitCode, 0, first.stderr + first.stdout);
  assert.equal(first.report.status, 'complete');
  const before = { agents: studio.state.agents.length, deployments: studio.state.deployments.length, models: studio.state.models.length, posts: studio.state.posts };
  const second = await run(studio.url, 'd-재실행');
  assert.equal(second.exitCode, 0, second.stderr + second.stdout);
  assert.equal(second.report.status, 'complete');
  assert.deepEqual({ agents: studio.state.agents.length, deployments: studio.state.deployments.length, models: studio.state.models.length },
    { agents: before.agents, deployments: before.deployments, models: before.models });
  assert.equal(studio.state.posts, before.posts, '재실행에서 신규 POST가 없어야 한다');
  evidence.c = { 종료코드: first.exitCode, 보고서상태: first.report.status, 적용수: first.report.applied.length };
  evidence.d = { 종료코드: second.exitCode, 보고서상태: second.report.status, 재실행신규POST: studio.state.posts - before.posts, 중복생성: 0 };
  await studio.close();
}

const deploymentRecord = "if (!previous) recordApplied('deployment', deployment.id, currentStage);";
const catalogRecord = "recordApplied('catalog', catalog.id, currentStage);";
assert.equal(originalScript.split(deploymentRecord).length, 2, '배치 즉시 기록 호출은 하나여야 한다');
assert.equal(originalScript.split(catalogRecord).length, 2, '카탈로그 즉시 기록 호출은 하나여야 한다');
const mutantScript = path.join(temporary, 'scripts/register-recorded-models-mutant.mjs');
writeFileSync(mutantScript, originalScript.replace(deploymentRecord, '// 변이: 배치 즉시 기록 제거').replace(catalogRecord, '// 변이: 카탈로그 즉시 기록 제거'));
{
  const studio = await fakeStudio({ failCatalog: true });
  const mutant = await run(studio.url, '변이-카탈로그-500', mutantScript);
  assert.notEqual(mutant.exitCode, 0);
  const acceptancePasses = mutant.report.status === 'partial' && mutant.report.applied.some(item => item.kind === 'agent' && item.id)
    && mutant.report.applied.some(item => item.kind === 'deployment' && item.id);
  assert.equal(acceptancePasses, false, '즉시 기록을 제거한 변이는 (b)의 배치 ID 보존 조건을 실패해야 한다');
  evidence.변이 = { 결과: '검출', 종료코드: mutant.exitCode, 보고서상태: mutant.report.status,
    applied종류: mutant.report.applied.map(item => item.kind), 배치ID조건통과: acceptancePasses };
  await studio.close();
}

const report = { status: '통과', generatedAt: new Date().toISOString(), 시험: evidence,
  변이설명: 'TEMP 복사본에서 배치·카탈로그 응답 직후 recordApplied 두 호출을 제거하고 카탈로그 500 시나리오를 실행했다.',
  위치: '테스트 전용 메모리 HTTP 서버; 운영 Studio와 DB 접근 없음', temporary };
writeFileSync(path.join(out, 'registration-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
