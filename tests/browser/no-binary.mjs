import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { browserTestRuntime } from "./runtime.mjs";
import { StudioDatabase } from "../../apps/studio/src/server/database/client.ts";
import { DeploymentRepository } from "../../apps/studio/src/server/database/deployments.ts";
import { deploymentPresets } from "../../packages/studio_domain/dist/common/index.js";
import { emptyDeployment, emptyStage } from "../../packages/studio_domain/dist/front/index.js";

// node --import tsx tests/browser/no-binary.mjs --url http://127.0.0.1:43181 --out tests/reports/no-binary/browser
const { url, out, chromium, expect } = browserTestRuntime("no-binary");
assert.equal(url, "http://127.0.0.1:43181", "격리 시험 주소만 허용한다");
await fs.mkdir(out, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await fs.mkdtemp(path.join(tmpdir(), "studio-no-binary-browser-"));
const dbPath = path.join(temporary, "studio.sqlite");
const probe = createServer();
await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(43181, "127.0.0.1", resolve); });
await new Promise(resolve => probe.close(resolve));
const database = new StudioDatabase(dbPath), repository = new DeploymentRepository(database.connection);
const agent = database.createAgent({ name: "격리 시험 agent", host: "127.0.0.1", port: 59991 });
const source = deploymentPresets[0].stages[0];
const stage = { ...emptyStage(), ...source, agentId: agent.id, nodeId: "legacy-json", binary: "C:\\old\\native.exe",
  loadOptionsJson: JSON.stringify({ ...JSON.parse(source.loadOptionsJson), binary: "C:\\old\\native.exe", future_option: { kept: true } }) };
const records = [repository.create({ ...emptyDeployment(), name: "옛 JSON 배치", totalLayers: source.layerEnd, stages: [stage] }),
  repository.create({ ...emptyDeployment(), name: "옛 폼 배치", totalLayers: 1,
    stages: [{ ...emptyStage(), agentId: agent.id, nodeId: "legacy-form", artifact: "S:\\models\\old.gguf", endpoint: "127.0.0.1:53301", binary: "C:\\old\\native.exe" }] })];
database.close();
// .cache worktree는 Express sendFile의 숨김 경로 정책에 걸린다. 빌드 산출물 그대로 TEMP에서 실행한다.
const runtime = path.join(temporary, "runtime");
await fs.cp(path.join(root, "apps/studio/dist"), runtime, { recursive: true });
const serverLog = [];
const server = spawn(process.execPath, [path.join(runtime, "server/index.cjs")], { cwd: temporary, windowsHide: true,
  env: { ...process.env, NODE_ENV: "production", P4STUDIO_PORT: "43181", P4STUDIO_SQLITE_PATH: dbPath,
    P4STUDIO_SEED_DEMO: "false", P4STUDIO_AGENT_TUNNELS: "[]", P4STUDIO_AGENT_MANAGEMENT: "[]" }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", data => serverLog.push(String(data))); server.stderr.on("data", data => serverLog.push(String(data)));
let browser, context, page, failure = null, p4Connections = 0;
const checks = [], screenshots = [], errors = [];
const browserArgs = ["--disable-breakpad", "--disable-crash-reporter", "--noerrdialogs", "--disable-features=Crashpad"];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${url}/health`)).ok; } catch { /* 자식 서버 기동 대기 */ }
    if (ready) break;
    if (server.exitCode !== null) throw Error(`격리 서버 종료: ${serverLog.join("")}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, "격리 서버가 기동해야 한다");
  browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE, args: browserArgs,
    env: { ...process.env, CHROME_HEADLESS: "1", CHROME_CRASH_REPORTER_DISABLE: "1" } });
  context = await browser.newContext({ viewport: { width: 1535, height: 1100 }, locale: "ko-KR" });
  await context.addInitScript(() => { if (!localStorage.getItem("p4studio.language")) localStorage.setItem("p4studio.language", "ko"); });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.routeWebSocket("**/api/p4-tunnel", socket => { p4Connections++; socket.close(); });
  const capture = async name => { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file), fullPage: true }); screenshots.push(file); };
  for (const record of records) {
    const editUrl = `${url}/models/${encodeURIComponent(record.id)}/edit`;
    await page.goto(editUrl);
    await expect(page.getByRole("heading", { name: record.name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: record.name, exact: true })).toBeVisible();
    await page.getByTestId(/^flow-node-/).first().click();
    const options = page.getByLabel("나머지 LOAD 인자 (JSON)", { exact: true });
    await expect(options).toBeVisible();
    assert(!Object.hasOwn(JSON.parse(await options.inputValue()), "binary"));
    await expect(page.getByLabel("에이전트의 런타임 실행 파일", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/실행 파일은 agent가 정합니다/)).toBeVisible();
    assert(!(await page.locator("body").innerText()).includes("C:\\old\\native.exe"));
    await page.getByText("전송할 LOAD 내용 미리보기", { exact: true }).click();
    assert(!Object.hasOwn(JSON.parse(await page.getByTestId("model-node-inspector").locator("pre").innerText()), "binary"));
    // 다른 공개 옵션을 편집하여 실제 HTTP 저장·재읽기까지 확인한다.
    const value = JSON.parse(await options.inputValue()); value.future_option = { edited: true };
    await options.fill(JSON.stringify(value, null, 2));
    const responsePromise = page.waitForResponse(response => response.request().method() === "PUT" && response.url() === `${url}/api/model-deployments/${record.id}`);
    await page.getByRole("button", { name: "구성 저장", exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const saved = await response.json();
    assert(!Object.hasOwn(saved.stages[0], "binary"));
    assert.deepEqual(JSON.parse(saved.stages[0].loadOptionsJson).future_option, { edited: true });
    assert(!Object.hasOwn(JSON.parse(saved.stages[0].loadOptionsJson), "binary"));
    await page.goto(editUrl); await page.getByTestId(/^flow-node-/).first().click();
    await expect(options).toBeVisible();
    assert.deepEqual(JSON.parse(await options.inputValue()).future_option, { edited: true });
    await page.getByText(/실행 파일은 agent가 정합니다/).scrollIntoViewIfNeeded();
    await capture(record.stages[0].nodeId);
    checks.push(`${record.name}: deep URL·reload·옛 실행 경로 부재·편집 저장·재읽기 통과`);
  }
  // 생성 프리셋도 실행 경로 없이 편집 가능해야 한다.
  await page.goto(`${url}/models/new`); await page.getByRole("button", { name: "기본 구성", exact: true }).click();
  const preset = deploymentPresets[0];
  await page.getByRole("article", { name: preset.name, exact: true }).getByRole("button", { name: "이 구성으로 채우기", exact: true }).click();
  await page.getByRole("button", { name: "기본 구성", exact: true }).click();
  await page.getByTestId(/^flow-node-/).first().click();
  assert(!Object.hasOwn(JSON.parse(await page.getByLabel("나머지 LOAD 인자 (JSON)", { exact: true }).inputValue()), "binary"));
  await page.getByText(/실행 파일은 agent가 정합니다/).scrollIntoViewIfNeeded();
  await capture("preset"); checks.push("프리셋 생성 화면 실행 경로 부재");
  for (const language of ["en", "ko", "zh", "es", "hi", "ar", "fr", "pt"]) {
    const bundle = JSON.parse(await fs.readFile(path.join(root, `apps/studio/assets/i18n/${language}.json`), "utf8"));
    assert(!Object.hasOwn(bundle, "models.binary.label"));
    await page.evaluate(language => localStorage.setItem("p4studio.language", language), language);
    await page.goto(`${url}/models/${records[0].id}/edit`); await page.getByTestId(/^flow-node-/).first().click();
    await expect(page.getByText(bundle["models.load.options.message"], { exact: true })).toBeVisible();
    assert(!Object.hasOwn(JSON.parse(await page.getByLabel(bundle["models.load.options.label"], { exact: true }).inputValue()), "binary"));
  }
  checks.push("8개 언어에서 agent 실행 파일 안내·옛 키 삭제·경로 없는 옵션 확인");
  assert.equal(p4Connections, 0, "P4 연결은 없어야 한다"); assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error.stack ?? error); process.exitCode = 1;
  if (page) { await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {}); screenshots.push("failure.png"); }
} finally {
  await context?.close(); await browser?.close();
  const exited = server.exitCode !== null;
  if (!exited) { const done = once(server, "exit"); server.kill(); await done; }
  await fs.writeFile(path.join(out, "server.log"), serverLog.join(""));
  const report = { 결과: failure ? "실패" : "통과", url, 임시SQLite: dbPath, 검증: checks, screenshots, errors, p4Connections,
    browserArgs, 서버종료확인: server.exitCode !== null || server.signalCode !== null, 범위: "격리 인스턴스 시나리오, 실제 P4·GPU 실행 없음", failure };
  await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
