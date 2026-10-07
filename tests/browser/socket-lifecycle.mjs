import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserTestRuntime } from './runtime.mjs';
import { decodeP4Event, encodeP4Event, frameP4Event, P4_RESULT_CONTENT_TYPE } from '../../packages/p4-protocol/dist/index.js';
import { deploymentSchema } from '../../packages/studio_domain/dist/common/index.js';
const { url: base, out, chromium } = browserTestRuntime('socket-lifecycle');
await fs.mkdir(out, { recursive: true });
assert.equal((await fetch(base + '/health')).status, 200);
const agents = ['head', 'gateway', 'tail'].map(name => ({ id: crypto.randomUUID(), name, host: `fixture-${name}`, port: 52000 }));
const topology = { agents, groups: [{ id: crypto.randomUUID(), name: 'fixture-group', gatewayAgentId: agents[1].id, memberAgentIds: [agents[0].id, agents[1].id] }] };
const now = new Date().toISOString();
const stages = [0, 1, 1, 2].map((agentIndex, index) => ({ id: `stage-${index}`, agentId: agents[agentIndex].id, nodeId: `node-${index}`, nodeGeneration: 9,
  artifact: 'fixture.gguf', layerStart: index, layerEnd: index + 1, binary: 'fixture', endpoint: '', device: '', options: '', argsJson: '[]', environmentJson: '[]', customPayload: '{}',
  loadOptionsJson: JSON.stringify({ resource_profile: { max_input_tokens: 150000, max_request_bytes: 1048576, max_request_retained_bytes: 67108864, max_requests: 10, max_output_tokens_per_request: 100, max_output_tokens: 1000 } }) }));
const record = deploymentSchema.parse({ id: crypto.randomUUID(), name: 'SESSION socket lifecycle fixture', adapter: 'llamacpp', totalLayers: 4, contextSize: 512,
  sequenceCapacity: 10, nBatch: 128, nUbatch: 64, timeoutMs: 3000, loadContentType: '', loadedContentType: '', unloadContentType: '', unloadedContentType: '', errorContentType: '',
  status: 'loaded', loadGeneration: 42, operationId: 'fixture-load', error: '', stages, resolvedAddresses: Object.fromEntries(agents.map(agent => [agent.id, `tcp://${agent.host}:${agent.port}`])),
  reports: stages.map(stage => ({ stageId: stage.id, state: 'loaded', loadOutcome: 'succeeded', resourceState: 'present', detail: '', updatedAt: now, telemetry: null })), createdAt: now, updatedAt: now });
const report = { mode: 'scenario with mocked P4 and HTTP mutations; deployed UI bundle', testedUrl: base + '/inference/query', status: 'running', consoleErrors: [], pageErrors: [], runs: [], frames: [], settlements: [], screenshots: [], limitations: 'No GPU inference or real 40-minute soak. Production model state and owners are untouched.' };
const browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const sockets = [];
const sessions = new Map();
let failNext = false;
await context.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url()), body = request.postDataJSON();
  if (url.pathname === '/api/model-deployments') return route.fulfill({ json: { deployments: [record] } });
  if (url.pathname === '/api/graph-agents') return route.fulfill({ json: topology });
  if (url.pathname.startsWith('/api/model-deployments/')) {
    if (request.method() === 'PUT') Object.assign(record, body);
    return route.fulfill({ json: record });
  }
  if (url.pathname.startsWith('/api/operation-leases')) {
    if (url.pathname.endsWith('/settlement')) report.settlements.push({ loadGeneration: body.loadGeneration, pendingSettlement: body.pendingSettlement, submitted: body.submitted });
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 });
    return route.fulfill({ json: { operationId: body?.operationId ?? url.pathname.split('/')[3], expiresAt: Date.now() + 30000, ready: true } });
  }
  return route.continue();
});
await context.routeWebSocket('**/api/p4-tunnel', ws => {
  const socket = { ws, agentId: '', operationId: '', sessions: 0, finish: false, closed: false };
  sockets.push(socket);
  ws.onClose(() => { socket.closed = true; });
  const reply = (original, contentType, payload, eventClass = 3) => ws.send(Buffer.from(frameP4Event(encodeP4Event({ ...original, eventId: crypto.randomUUID(), source: original.target, target: original.source, causationId: original.eventId, contentType, class: eventClass, payload: new TextEncoder().encode(JSON.stringify(payload)) }))));
  ws.onMessage(message => {
    if (typeof message === 'string') {
      const control = JSON.parse(message);
      if (control.type === 'open') { socket.agentId = control.agentId; socket.operationId = control.connectionId; ws.send(JSON.stringify({ ...control, type: 'opened' })); }
      return;
    }
    if (message.length === 4 && message.readUInt32BE(0) === 0) { socket.finish = true; ws.send(Buffer.alloc(4)); return; }
    const event = decodeP4Event(new Uint8Array(message).slice(4));
    const body = JSON.parse(new TextDecoder().decode(event.payload));
    report.frames.push({ operationId: socket.operationId, agentId: socket.agentId, contentType: event.contentType, nodeId: event.target.nodeId ?? null });
    if (event.contentType.includes('session-v4')) {
      socket.sessions++; sessions.set(body.session_id, (sessions.get(body.session_id) ?? 0) + 1);
      reply(event, 'application/vnd.p4.llamacpp.session-ready-v4+json', { state: 'ready', session_id: body.session_id, load_generation: body.load_generation });
    } else if (event.contentType.includes('prefill-v3')) {
      assert.equal(sessions.get(body.session_id), 4);
      const operationSockets = sockets.filter(candidate => candidate.operationId === socket.operationId && candidate.sessions);
      assert.equal(operationSockets.length, 2);
      assert(operationSockets.filter(candidate => candidate !== socket).every(candidate => candidate.finish), 'SESSION-only connections must FINISH before PREFILL');
      report.runs.push({ sessionId: body.session_id, requestId: body.request_id, returnChannel: event.source.channel, preparationRetired: true });
      if (failNext) {
        failNext = false; ws.send(JSON.stringify({ type: 'closed', connectionId: socket.operationId, detail: 'Fixture active return socket lost' })); return;
      }
      const identity = { request_id: body.request_id, submission_event_id: event.eventId, load_generation: body.load_generation, session_id: body.session_id, sequence_id: 0, incarnation: 3 };
      setTimeout(() => {
        reply(event, 'application/vnd.p4.llamacpp.output-v6+json', { ...identity, token: 1, text: 'TypeScript는 JavaScript에 정적 타입을 추가합니다.', position: 0, stop: 'length', output_ordinal: 0, release_operation_id: 10 }, 2);
        reply(event, 'application/vnd.p4.llamacpp.release-receipt-v1+json', { load_generation: body.load_generation, session_id: body.session_id, members: [{ request_id: body.request_id, submission_event_id: event.eventId, sequence_id: 0, incarnation: 3, operation_id: 10 }] });
      }, 100);
    } else reply(event, P4_RESULT_CONTENT_TYPE, { detail: 'No monitoring fixture' });
  });
});
const page = await context.newPage();
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
page.on('pageerror', error => report.pageErrors.push(error.message));
try {
  assert.equal((await page.goto(report.testedUrl)).status(), 200);
  await page.getByRole('combobox').filter({ hasText: record.name }).waitFor();
  await page.getByLabel('동시 질의 수').fill('1'); await page.getByLabel('반복 횟수').fill('1');
  await page.getByLabel('반복 간격 (초)').fill('0'); await page.getByLabel(/최대 생성 토큰/).fill('16');
  await page.getByLabel('프롬프트').fill('타입스크립트에 대해 설명하라');
  for (let index = 0; index < 2; index++) {
    const admission = page.waitForResponse(response => new URL(response.url()).pathname === '/api/operation-leases' && response.request().method() === 'POST');
    await page.getByRole('button', { name: '질의 전송', exact: true }).click();
    const runId = (await admission).request().postDataJSON().operationId;
    await page.getByRole('article', { name: `${record.name} · ${runId}`, exact: true }).getByText('완료', { exact: true }).waitFor({ timeout: 15000 });
  }
  assert.equal(report.runs.length, 2); assert.equal(report.settlements.length, 2);
  assert.notEqual(report.runs[0].returnChannel, report.runs[1].returnChannel);
  assert(report.settlements.every(settlement => settlement.pendingSettlement === 0));
  const completed = path.join(out, 'two-completed-runs.png'); await page.screenshot({ path: completed, fullPage: true }); report.screenshots.push(completed);
  failNext = true;
  await page.getByRole('button', { name: '질의 전송', exact: true }).click();
  await page.getByTestId('inference-run-group').filter({ hasText: 'Fixture active return socket lost' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: '질의 전송', exact: true }).click();
  const blocked = page.getByRole('alert').filter({ hasText: /Previous request settlement is unknown|The previous inference still owns this model/ });
  await blocked.waitFor(); report.blockedNextRun = await blocked.textContent();
  assert.equal(report.runs.length, 3); assert.equal(report.settlements.length, 2);
  const fenced = path.join(out, 'active-return-loss-fenced.png'); await page.screenshot({ path: fenced, fullPage: true }); report.screenshots.push(fenced);
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await context.tracing.stop({ path: path.join(out, 'trace.zip') }); await browser.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, runs: report.runs.length, settled: report.settlements.length, report: path.join(out, 'report.json') }));
if (report.status !== 'passed') process.exitCode = 1;
