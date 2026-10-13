/** 운영 모델 등록과 실행은 이 모듈의 브라우저 UI 동선만 사용한다. */
export async function configureRecordedModel(page, config, base = 'http://127.0.0.1:43120') {
  await page.goto(`${base}/models/${config.id ? `${encodeURIComponent(config.id)}/edit` : 'new'}`);
  await page.getByRole('button', { name: '기본 구성', exact: true }).click();
  await page.getByLabel('모델 이름', { exact: false }).fill(config.name);
  await page.getByLabel('실측 인사이트·출처', { exact: true }).fill(config.notes);
  await page.getByLabel('전체 레이어 수', { exact: false }).fill(String(config.layers));
  await page.getByLabel('제한 시간 (ms)', { exact: false }).fill('7200000');
  await page.getByRole('combobox', { name: '런타임 호환성' }).click();
  await page.getByRole('option', { name: 'Physical wire ABI · 이종 장치', exact: true }).click();
  await page.getByRole('region', { name: '기본 구성', exact: true }).getByRole('button', { name: '닫기', exact: true }).click();
  for (let i = 0; i < config.stages.length; i++) {
    const stage = config.stages[i];
    if (config.id) await page.getByTestId(/^flow-node-/).filter({ hasText: stage.previousNodeId ?? stage.nodeId }).dispatchEvent('click');
    else await page.getByTestId(`flow-agent-${stage.agentId}`).getByRole('button', { name: '적재 stage 추가', exact: true }).dispatchEvent('click');
    const inspector = page.getByTestId('model-node-inspector');
    await inspector.getByLabel('노드 ID', { exact: true }).fill(stage.nodeId);
    await inspector.getByLabel('네이티브 plan 인자', { exact: true }).fill(stage.plan);
    await inspector.getByLabel('나머지 LOAD 인자 (JSON)', { exact: true }).fill(JSON.stringify(stage.options, null, 2));
    await inspector.getByRole('button', { name: '닫기', exact: true }).click();
  }
  const saved = page.waitForResponse(r => r.url().includes('/api/model-deployments') && ['POST','PUT'].includes(r.request().method()) && !r.url().includes('/receipt'));
  await page.getByRole('button', { name: '구성 저장', exact: true }).click();
  const response = await saved;
  if (!response.ok()) throw new Error(`구성 저장 실패 ${response.status()}: ${await response.text()}`);
  return await response.json();
}

export async function startRecordedRun(page, modelName, { concurrency, repetitions = 1, intervalSeconds = 0, maxTokens, prompt, repeatMode = 'after-completion' }) {
  await page.getByRole('button', { name: '인퍼런스', exact: true }).click();
  await page.getByRole('combobox', { name: /모델/ }).click();
  await page.getByRole('option', { name: modelName, exact: true }).click();
  await page.getByLabel('동시 질의 수', { exact: true }).fill(String(concurrency));
  await page.getByLabel('반복 횟수', { exact: true }).fill(String(repetitions));
  await page.getByLabel('반복 간격 (초)', { exact: true }).fill(String(intervalSeconds));
  await page.getByLabel(/최대.*토큰/).fill(String(maxTokens));
  await page.getByRole('combobox', { name: '반복 방식', exact: true }).click();
  await page.getByRole('option', { name: repeatMode === 'after-completion' ? /앞 웨이브.*완료/ : /예정/ }).click();
  await page.getByLabel('프롬프트', { exact: true }).fill(prompt);
  await page.getByRole('button', { name: '질의 전송', exact: true }).click();
}
