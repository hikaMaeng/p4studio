import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { browserTestRuntime } from "./runtime.mjs";

const { url, out, chromium } = browserTestRuntime("wave-results");
await fs.mkdir(out, { recursive: true });
const fixture = { id: "wave-ui-check", modelId: "fixture-only", modelName: "Wave UI fixture", state: "completed", submitted: 67, completed: 67, createdAt: "2026-10-05T06:00:00Z", error: null, settings: { concurrency: 25, repetitions: 21, intervalMs: 1000, maxTokens: 20 }, requests: [] };
for (let wave = 1; wave <= 22; wave++) for (let index = 0; index < (wave === 1 ? 25 : 2); index++) {
  const submitted = Date.parse(fixture.createdAt) + wave * 10000;
  fixture.requests.push({ id: `wave-${wave}-session-${index + 1}`, waveIndex: wave === 22 ? null : wave, state: "completed", prompt: `Wave ${wave} session ${index + 1}`, text: `Fixture response ${wave}/${index + 1}`, receivedTokens: 10, prefillTps: 30 + wave, generationTps: 10 + wave, finalTps: 10 + wave, ttftMs: 100 + index * 10, submittedAt: new Date(submitted).toISOString(), completedAt: new Date(submitted + 2000 + index).toISOString(), error: null });
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1535, height: 1000 }, locale: "ko-KR" });
await context.addInitScript(fixture => {
  if (!localStorage.getItem("p4studio.language")) localStorage.setItem("p4studio.language", "ko");
  localStorage.setItem("p4studio.inference.history.v1", JSON.stringify({ timingVersion: 3, runs: [fixture] }));
}, fixture);
const page = await context.newPage(), errors = [], steps = [], screenshots = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
const check = async (name, operation) => { await operation(); steps.push({ name, status: "passed" }); };
const screenshot = async name => { const file = path.join(out, `${name}.png`); await page.getByTestId("inference-wave-results").evaluate(element => element.scrollIntoView({ block: "start" })); await page.screenshot({ path: file }); screenshots.push(file); };
const group = wave => page.locator(`[data-testid="inference-wave-row"][data-wave-index="${wave}"]`);
const toggle = wave => group(wave).getByTestId("inference-wave-toggle");
const waitCount = async (locator, count) => { await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: locator, count }); };
let status = "passed", failure;
try {
  assert.equal((await fetch(`${url}/health`)).status, 200);
  await page.goto(`${url}/inference/history/${fixture.id}`);
  await page.getByTestId("inference-wave-results").waitFor();
  await check("twenty waves per first page, members initially collapsed", async () => {
    assert.equal(await page.getByTestId("inference-wave-row").count(), 20);
    assert.equal(await page.getByTestId("inference-request-row").count(), 0);
    assert.equal(await page.getByTestId("inference-wave-pagination").innerText(), "이전\n웨이브 1 / 2 페이지\n다음");
  });
  await screenshot("collapsed");
  await check("wave membership and independent statistics", async () => {
    await toggle(1).click();
    await waitCount('[data-wave-index="1"] [data-testid="inference-request-row"]', 25);
    assert.match(await group(1).getByTestId("inference-wave-statistics").innerText(), /220 ms/);
    const values = await group(1).getByTestId("inference-wave-statistics").evaluate(element => [...element.children].map(child => child.textContent));
    assert.deepEqual(values.slice(1), ["진행률25 / 25", "TTFT p50220 ms", "TTFT p95330 ms", "최대 TTFT340 ms", "2026. 10. 5. 오후 3:00:10", "프리필 TPS p5031.00", "생성 TPS p5011.00", "최종 TPS p5011.00", "전체 응답 시간2024 ms"]);
    const ids = await group(1).getByTestId("inference-request-row").evaluateAll(rows => rows.map(row => row.getAttribute("data-request-id")));
    assert(ids.every(id => id.startsWith("wave-1-")));
    await toggle(2).click();
    await waitCount('[data-wave-index="2"] [data-testid="inference-request-row"]', 2);
    assert.equal(await page.getByTestId("inference-request-row").count(), 27);
  });
  await screenshot("expanded");
  await check("collapse, keyboard expansion and wave pagination preserve membership", async () => {
    await toggle(1).click(); assert.equal(await toggle(1).getAttribute("aria-expanded"), "false");
    await toggle(1).press("Enter"); assert.equal(await toggle(1).getAttribute("aria-expanded"), "true");
    await page.getByTestId("inference-wave-pagination").getByRole("button", { name: "다음", exact: true }).click();
    assert.equal(await page.getByTestId("inference-wave-row").count(), 2);
    assert.equal(await group(21).count(), 1); assert.equal(await group("legacy").count(), 1);
    await toggle("legacy").click();
    await waitCount('[data-wave-index="legacy"] [data-testid="inference-request-row"]', 2);
    assert.match(await group("legacy").innerText(), /wave-22-session-1/);
    await screenshot("second-page-legacy");
    await page.getByTestId("inference-wave-pagination").getByRole("button", { name: "이전", exact: true }).click();
    assert.equal(await toggle(1).getAttribute("aria-expanded"), "true");
    assert.equal(await group(1).getByTestId("inference-request-row").count(), 25);
  });
  await check("session detail deep URL, response and back navigation", async () => {
    await group(1).locator('[data-request-id="wave-1-session-1"]').press("Enter");
    await page.waitForURL(`${url}/inference/history/${fixture.id}/requests/wave-1-session-1`);
    await page.getByTestId("inference-request-answer").waitFor();
    await page.getByText("Fixture response 1/1", { exact: true }).waitFor();
    assert.match(await page.getByTestId("inference-request-answer").innerText(), /Fixture response 1\/1/);
    await page.goBack(); await page.getByTestId("inference-wave-results").waitFor();
    await page.reload(); await page.getByTestId("inference-wave-results").waitFor();
    assert.equal(await page.getByTestId("inference-wave-row").count(), 20);
  });
  await check("responsive statistics stay two rows with contained table scrolling", async () => {
    await toggle(1).click();
    for (const width of [1535, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await group(1).getByTestId("inference-wave-statistics").evaluate(element => ({ tops: [...element.children].map(child => Math.round(child.getBoundingClientRect().top)), pageWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.equal(new Set(layout.tops).size, 2);
      assert(layout.pageWidth <= layout.viewport);
      await screenshot(`responsive-${width}`);
    }
  });
  await check("query surface uses the same wave list", async () => {
    await page.setViewportSize({ width: 1535, height: 1000 });
    await page.goto(`${url}/inference/query`); await page.getByTestId("inference-wave-results").waitFor();
    assert.equal(await page.getByTestId("inference-wave-row").count(), 20);
  });
  await check("Arabic RTL and unnumbered sessions", async () => {
    await page.evaluate(() => localStorage.setItem("p4studio.language", "ar")); await page.reload(); await page.getByTestId("inference-wave-results").waitFor();
    assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
    assert.equal(await toggle(1).count(), 1);
    await toggle(1).click(); await waitCount('[data-wave-index="1"] [data-testid="inference-request-row"]', 25);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot("rtl");
  });
  await check("empty results preserve explicit empty state", async () => {
    await page.evaluate(() => { localStorage.setItem("p4studio.language", "ko"); localStorage.removeItem("p4studio.inference.history.v1"); });
    // A fresh context is required because init script restores the fixture on reload.
    const empty = await browser.newContext({ locale: "ko-KR" }); const emptyPage = await empty.newPage();
    await emptyPage.goto(`${url}/inference/query`); await emptyPage.getByTestId("inference-wave-results").waitFor();
    assert.equal(await emptyPage.getByTestId("inference-wave-row").count(), 0);
    assert((await emptyPage.getByTestId("inference-wave-results").innerText()).length > 10); await empty.close();
  });
  assert.deepEqual(errors, []);
} catch (error) { status = "failed"; failure = error.stack; await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }); }
finally { await fs.writeFile(path.join(out, "browser-report.json"), JSON.stringify({ status, mode: "scenario", url, fixture: { waves: 22, sessions: fixture.requests.length, firstWaveSessions: 25 }, steps, errors, failure, screenshots }, null, 2)); await browser.close(); }
console.log(JSON.stringify({ status, steps: steps.length, report: path.join(out, "browser-report.json"), failure }));
if (status !== "passed") process.exitCode = 1;
