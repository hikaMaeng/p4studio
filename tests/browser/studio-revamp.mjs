import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { browserTestRuntime } from './runtime.mjs';
import { deploymentPresets } from '../../packages/studio_domain/dist/common/index.js';
const { url, out, chromium, expect } = browserTestRuntime('studio-revamp');
await fs.mkdir(out, { recursive: true });
assert.equal((await fetch(`${url}/health`)).status, 200);
const batch = { buckets: [1, 1, 1, 1, 1], batches: 5, requests: 17, multiRequestBatches: 4 };
const empty = { buckets: [0, 0, 0, 0, 0], batches: 0, requests: 0, multiRequestBatches: 0 };
const speculative = { rounds: 20, drafted: 40, accepted: 20, emittedTokens: 25, full: 5, direct: 2, replay: 13, draftedMin: 2, draftedMax: 2, discardedPoints: 0,
  points: [{ atUnixMs: 1791763200000, rounds: 20, drafted: 40, accepted: 20, emittedTokens: 25, full: 5, direct: 2, replay: 13 }] };
const fixture = { id: 'revamp-fixture', modelId: 'fixture', modelName: '개편 관측 모사 기록', state: 'completed', submitted: 1, completed: 1, createdAt: '2026-10-12T00:00:00Z', error: null,
  settings: { concurrency: 1, repetitions: 1, intervalMs: 1000, maxTokens: 20, repeatMode: 'after-completion' }, speculative,
  batchRequestDistributions: { all: batch, prefill: empty, decode: empty, verify: batch, replay: { buckets: [1, 0, 0, 0, 0], batches: 1, requests: 1, multiRequestBatches: 0 } },
  telemetrySeries: { version: 1, output: [], spans: [], batches: [{ atUnixMs: 1791763200000, stageIndex: 0, observations: 1, physicalBatches: 2, capacityRows: 128, fallbackCapacityRows: 0, rows: 16, readyRowsMax: 2, prefillRows: 0, decodeRows: 0, verifyRows: 12, replayRows: 4, stageMs: 10, idleMs: 0 }] },
  requests: [{ id: 'revamp-request', state: 'completed', prompt: '모사 질문', text: '모사 정상 답변', receivedTokens: 20, prefillTps: 1, generationTps: 2, finalTps: 2, ttftMs: 1000, waveIndex: 1, submittedAt: '2026-10-12T00:00:00Z', completedAt: '2026-10-12T00:00:10Z', error: null }] };
let browser;
const browserArgs = ['--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--disable-features=Crashpad'];
try {
  browser = process.env.HEADLESS_BROWSER_CDP_URL ? await chromium.connectOverCDP(process.env.HEADLESS_BROWSER_CDP_URL)
    : await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE, args: browserArgs,
      env: { ...process.env, CHROME_HEADLESS: '1', CHROME_CRASH_REPORTER_DISABLE: '1' } });
} catch (error) {
  const report = { status: 'blocked', url, checks: [], screenshots: [], failure: String(error), evidence: '브라우저 기동 실패. 렌더 동선은 미검증' };
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2)); process.exit(1);
}
const context = await browser.newContext({ viewport: { width: 1535, height: 1100 }, locale: 'ko-KR' });
await context.addInitScript(fixture => { if (!localStorage.getItem('p4studio.language')) localStorage.setItem('p4studio.language', 'ko'); if (!localStorage.getItem('p4studio.inference.history.v1')) localStorage.setItem('p4studio.inference.history.v1', JSON.stringify({ timingVersion: 3, runs: [fixture] })); }, fixture);
// 등록된 선언을 쿼리 선택용 LOAD fixture로만 투영한다. 실제 P4 bridge는 열지 않는다.
const actual = (await (await fetch(`${url}/api/model-deployments`)).json()).deployments;
const selected = actual.find(model => model.presetId === 'qwen38-mtp-nmax2');
assert(selected); const model = { ...selected, status: 'loaded', loadGeneration: 42, reports: selected.stages.map(stage => ({ stageId: stage.id,
  state: 'loaded', loadRequested: true, loadOutcome: 'succeeded', resourceState: 'present', detail: '', updatedAt: '', telemetry: null })) };
await context.route(`${url}/api/model-deployments`, route => route.fulfill({ json: { deployments: [model] } }));
let p4Connections = 0;
await context.routeWebSocket('**/api/p4-tunnel', socket => { p4Connections++; socket.close(); });
const page = await context.newPage(), checks = [], screenshots = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const capture = async (name, locator) => { const file = path.join(out, `${name}.png`);
  if (locator) { await locator.scrollIntoViewIfNeeded(); await locator.screenshot({ path: file }); }
  else await page.screenshot({ path: file, fullPage: true }); screenshots.push(file); };
let status = 'passed', failure;
try {
  await page.goto(`${url}/inference/history/${fixture.id}`); await expect(page.getByRole('main')).toHaveCount(1);
  const graph = page.getByRole('img', { name: /^페이즈별 발행 작업\./ }); await expect(graph).toBeVisible();
  const phaseFigure = page.getByRole('figure').filter({ has: graph });
  for (const phase of ['프리필 행 (물리 배치 평균)', '디코드 행 (물리 배치 평균)', '검증', '재실행']) {
    await expect(graph.getByLabel(phase, { exact: true })).toHaveCount(1);
    await expect(phaseFigure.getByText(phase, { exact: true })).toBeVisible();
  }
  const distribution = page.getByTestId('inference-batch-request-distribution');
  await expect(distribution.getByRole('table')).toBeVisible();
  const total = distribution.getByRole('row').filter({ has: page.getByRole('cell', { name: '전체 페이즈', exact: true }) });
  await expect(total).toContainText('3.40'); await expect(total).toContainText('80.0%');
  await expect(distribution.getByRole('columnheader', { name: '5+', exact: true })).toBeVisible();
  for (const ratio of ['25.0%', '10.0%', '65.0%']) await expect(page.getByTestId('inference-speculative-summary')).toContainText(ratio);
  await expect(page.getByTestId('inference-speculative-rate')).toHaveText('50.0%');
  await expect(page.getByTestId('inference-speculative-summary')).toContainText('관측 라운드 20');
  await expect(page.getByTestId('inference-replay-warning')).toContainText('재실행 경로가 처리량을 깎을 수 있음');
  checks.push('A1 네 계열', 'A2 1/2/3/4/5+·평균3.40·다중80%', 'A4 full25%·direct10%·replay65%·채택50%·replay 설명');
  await capture('phase-graph', phaseFigure);
  await capture('batch-distribution', distribution);
  await capture('speculative', page.getByTestId('inference-speculative'));
  await expect(page.getByText('앞 웨이브 완료 후 간격 뒤 다음 웨이브', { exact: true })).toBeVisible();
  checks.push('B2 결과의 반복 방식 표시'); await capture('observability');
  await page.reload(); await expect(total).toContainText('3.40'); checks.push('분포와 반복 방식 기록의 직접 URL·reload 복원');
  await page.goto(`${url}/inference/requests/revamp-request`);
  await expect(page.getByTestId('inference-request-metrics')).toContainText('입장 대기');
  await expect(page.getByTestId('inference-request-metrics')).toContainText('입장 후 첫 출력까지');
  await expect(page.getByTestId('inference-request-metrics').getByText('측정 불가', { exact: true })).toHaveCount(2);
  checks.push('A3 두 구간 측정 불가 표시'); await capture('admission');
  await page.goto(`${url}/inference/query`); await page.getByLabel('동시 질의 수', { exact: true }).fill('6');
  await expect(page.getByTestId('inference-slot-warning')).toContainText('한도(5)');
  await expect(page.getByTestId('inference-slot-warning')).toContainText('TTFT');
  await capture('slot-warning');
  await page.getByLabel('동시 질의 수', { exact: true }).fill('5'); await expect(page.getByTestId('inference-slot-warning')).toHaveCount(0);
  await expect(page.getByLabel('반복 방식', { exact: true })).toHaveText('간격마다 다음 웨이브');
  await page.getByLabel('반복 방식', { exact: true }).click();
  await page.getByRole('option', { name: '앞 웨이브 완료 후 간격 뒤 다음 웨이브', exact: true }).click();
  checks.push('B1 초과 경고·경계값 해제·B2 방식 선택'); await capture('workload');
  await page.getByLabel('동시 질의 수', { exact: true }).fill('1');
  await page.getByRole('textbox', { name: /프롬프트/ }).fill('SESSION 사전 거부 시험');
  // HTTP의 LOAD 모사 보고를 실제 API 사전 검증이 읽게 한다. 오류 문자열 주입은 하지 않는다.
  const cases = [
    { name: 'mismatch', contracts: ['none/0/0/0', 'cc/2/5/3'], ko: 'stage 간 speculative_contract가 다릅니다.', en: 'Stage speculative_contract values disagree.' },
    { name: 'partial', contracts: ['none/0/0/0', undefined], ko: '일부 stage의 LOAD 보고에 speculative_contract가 없습니다.', en: 'Some stage LOAD reports have no speculative_contract.' },
    { name: 'invalid', contracts: ['', ''], ko: 'stage의 speculative_contract가 유효한 문자열이 아닙니다.', en: 'A stage speculative_contract is not a valid string.' },
    { name: 'generation', contracts: ['none/0/0/0', 'none/0/0/0'], generation: 41, ko: 'SESSION 계약의 LOAD 세대가 현재 배치와 다릅니다.', en: 'The SESSION contract LOAD generation does not match the current deployment.' },
  ];
  for (const test of cases) {
    model.reports = model.stages.map((stage, index) => ({ stageId: stage.id, state: 'loaded', loadRequested: true,
      loadOutcome: 'succeeded', resourceState: 'present', detail: '', updatedAt: '',
      telemetry: { load_generation: test.generation ?? 42, ...(test.contracts[index] === undefined ? {} : { speculative_contract: test.contracts[index] }) } }));
    await page.getByRole('button', { name: '질의 전송', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: test.ko })).toBeVisible();
    await capture(`session-ko-${test.name}`);
    await page.getByRole('button', { name: '언어 변경', exact: true }).click();
    await page.getByRole('menuitem', { name: 'English', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: test.en })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: test.ko })).toHaveCount(0);
    await capture(`session-en-${test.name}`);
    await page.getByRole('button', { name: 'Send query', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: test.en })).toBeVisible();
    await page.getByRole('button', { name: 'Change language', exact: true }).click();
    await page.getByRole('menuitem', { name: '한국어', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: test.ko })).toBeVisible();
    checks.push(`C2 ${test.name} 한국어·영어 번역 및 SESSION 접속 전 거부`);
  }
  await page.goto(`${url}/models/new`); await page.getByRole('button', { name: '기본 구성', exact: true }).click();
  const presets = deploymentPresets.filter(preset => ['qwen38-none-seq16','qwen38-mtp-nmax2','mimo-dflash-nmax4'].includes(preset.id));
  for (const preset of presets) {
    const card = page.getByRole('article', { name: preset.name, exact: true });
    await expect(card).toBeVisible(); await capture(`preset-${preset.id}`, card);
  }
  await capture('presets');
  await page.getByRole('article', { name: presets[0].name, exact: true }).getByRole('button', { name: '이 구성으로 채우기', exact: true }).click();
  await expect(page.getByLabel('실측 인사이트·출처', { exact: true })).toHaveValue(presets[0].insightNotes);
  await capture('insight-notes');
  checks.push('D 세 preset과 적용 후 편집 노트·격리 DB 등록');
  await page.setViewportSize({ width: 390, height: 1000 }); await page.goto(`${url}/inference/history/${fixture.id}`);
  await expect(page.getByTestId('inference-batch-request-distribution')).toBeVisible();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await capture('mobile');
  await capture('mobile-distribution', page.getByTestId('inference-batch-request-distribution'));
  assert.equal(p4Connections, 0, '실제 또는 모사 P4 연결도 이 기록 표시 시험에는 필요 없다');
  assert.deepEqual(errors, []);
} catch (error) { status = 'failed'; failure = String(error.stack ?? error); process.exitCode = 1; await capture('failure'); }
finally { await context.close(); await browser.close(); const report = { status, url, evidence: '격리 DB·모사 관측 기록, 실제 P4/GPU 연동 아님', checks, screenshots, errors, p4Connections, browserArgs, failure }; await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
