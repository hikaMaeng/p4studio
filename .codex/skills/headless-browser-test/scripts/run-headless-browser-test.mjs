#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function todayStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return {
    day: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  };
}

// The URL is an input. This runner never rewrites the host: whoever invokes it
// knows which address is reachable from where the browser actually runs.
function browserUrl(input) {
  return new URL(input).toString();
}

function locator(page, step) {
  if (step.role) return page.getByRole(step.role, step.name ? { name: step.name } : {});
  if (step.label) return page.getByLabel(step.label);
  if (step.text) return page.getByText(step.text);
  if (step.title) return page.getByTitle(step.title);
  if (step.altText) return page.getByAltText(step.altText);
  if (step.testId) return page.getByTestId(step.testId);
  if (step.css) return page.locator(step.css);
  throw new Error(`Missing locator for ${step.action}`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    // Some runtimes install Playwright globally instead of in the project.
    // Point HEADLESS_BROWSER_PLAYWRIGHT_ROOT at that installation directory.
    const root = process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT;
    if (!root) {
      console.error("playwright is not resolvable; install it or set HEADLESS_BROWSER_PLAYWRIGHT_ROOT");
      throw error;
    }
    return createRequire(path.join(root, "package.json"))("playwright");
  }
}

function usage() {
  console.error("Usage: run-headless-browser-test.mjs --url <url> [--spec scenario.json] [--out dir]");
}

const urlArg = argValue("--url");
if (!urlArg) {
  usage();
  process.exit(2);
}

const stamp = todayStamp();
const outDir = path.resolve(argValue("--out") ?? path.join("test", stamp.day, `${stamp.time}_headless-browser-test`));
const screenshotDir = path.join(outDir, "screenshots");
await fs.mkdir(screenshotDir, { recursive: true });

const testedUrl = browserUrl(urlArg);
const specPath = argValue("--spec");
const steps = specPath
  ? JSON.parse(await fs.readFile(specPath, "utf8"))
  : [{ action: "goto", url: testedUrl }, { action: "assertRole", role: "main" }, { action: "screenshot", name: "smoke" }];

if (!Array.isArray(steps) || steps.length === 0) {
  throw new Error("--spec must contain a non-empty JSON array");
}

const { chromium } = await loadPlaywright();
const consoleErrors = [];
const pageErrors = [];
const screenshots = [];
const tracePath = path.join(outDir, "trace.zip");
const result = {
  status: "passed",
  mode: specPath ? "scenario" : "smoke",
  startedAt: new Date().toISOString(),
  inputUrl: urlArg,
  testedUrl,
  finalUrl: "",
  title: "",
  mainPresent: false,
  documentStatus: null,
  consoleErrors,
  pageErrors,
  screenshots,
  trace: tracePath,
  steps: []
};

// Let Playwright resolve its own browser unless the runtime supplies one.
const executablePath =
  process.env.HEADLESS_BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

let context;
let traceStopped = false;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const step of steps) {
    const entry = { action: step.action, status: "passed" };
    try {
      if (step.action === "goto") {
        const target = step.url?.startsWith("http") ? browserUrl(step.url) : new URL(step.url ?? "/", testedUrl).toString();
        const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: step.timeout ?? 30000 });
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        result.documentStatus ??= response?.status() ?? null;
      } else if (step.action === "click") {
        await locator(page, step).click({ timeout: step.timeout ?? 10000 });
      } else if (step.action === "fill") {
        await locator(page, step).fill(step.value ?? "", { timeout: step.timeout ?? 10000 });
      } else if (step.action === "assertText") {
        await page.getByText(step.text).first().waitFor({ state: "visible", timeout: step.timeout ?? 10000 });
      } else if (step.action === "assertRole") {
        await page.getByRole(step.role, step.name ? { name: step.name } : {}).first().waitFor({ state: "visible", timeout: step.timeout ?? 10000 });
      } else if (step.action === "waitForURL") {
        await page.waitForURL(step.url, { timeout: step.timeout ?? 10000 });
      } else if (step.action === "screenshot") {
        const filename = `${String(step.name ?? "screenshot").replace(/[^a-zA-Z0-9._-]+/g, "-")}.png`;
        const file = path.join(screenshotDir, filename);
        await page.screenshot({ path: file, fullPage: true });
        screenshots.push(file);
      } else {
        throw new Error(`Unsupported action: ${step.action}`);
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof Error ? error.message : String(error);
      result.status = "failed";
      const file = path.join(screenshotDir, `failure-${result.steps.length + 1}-${step.action}.png`);
      await page.screenshot({ path: file, fullPage: true }).then(() => screenshots.push(file)).catch(() => {});
      result.steps.push(entry);
      break;
    }
    result.steps.push(entry);
  }

  result.finalUrl = page.url();
  result.title = await page.title().catch(() => "");
  result.mainPresent = await page.getByRole("main").count().then((count) => count > 0).catch(() => false);
  await context.tracing.stop({ path: tracePath });
  traceStopped = true;
} catch (error) {
  result.status = "failed";
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  if (context && !traceStopped) {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
  }
  await browser.close();
}

result.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

const markdown = [
  `# Headless Browser Test`,
  ``,
  `- status: ${result.status}`,
  `- mode: ${result.mode}`,
  `- inputUrl: ${result.inputUrl}`,
  `- testedUrl: ${result.testedUrl}`,
  `- finalUrl: ${result.finalUrl}`,
  `- documentStatus: ${result.documentStatus ?? "unknown"}`,
  `- title: ${result.title || "(empty)"}`,
  `- mainPresent: ${result.mainPresent}`,
  `- consoleErrors: ${consoleErrors.length}`,
  `- pageErrors: ${pageErrors.length}`,
  `- trace: ${tracePath}`,
  `- screenshots: ${screenshots.length}`,
  ``,
  `## Screenshots`,
  ...screenshots.map((file) => `- ${file}`),
  ``,
  `## Step Results`,
  ...result.steps.map((step, index) => `- ${index + 1}. ${step.action}: ${step.status}${step.error ? ` - ${step.error}` : ""}`),
  ``,
  `## Browser Errors`,
  ...consoleErrors.map((error) => `- console: ${error}`),
  ...pageErrors.map((error) => `- page: ${error}`)
];
await fs.writeFile(path.join(outDir, "report.md"), `${markdown.join("\n")}\n`, "utf8");

console.log(`headless-browser-test status=${result.status}`);
console.log(`mode=${result.mode}`);
console.log(`report=${path.join(outDir, "report.md")}`);
for (const file of screenshots) console.log(`screenshot=${file}`);
process.exit(result.status === "passed" ? 0 : 1);
