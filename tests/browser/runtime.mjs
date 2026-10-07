import path from "node:path";
import { createRequire } from "node:module";

/** Shared CLI/environment boundary for browser fixtures; never chooses a live service. */
export function browserTestRuntime(name) {
  const argument = key => {
    const index = process.argv.indexOf(key);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  const url = argument("--url");
  if (!url) throw new Error("Pass --url <studio-url>; --out defaults to ignored tests/artifacts");
  const out = path.resolve(argument("--out") ?? `tests/artifacts/${name}`);
  const require = createRequire(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT
    ? path.join(process.env.HEADLESS_BROWSER_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
  const { chromium } = require("playwright"), { expect } = require("playwright/test");
  return { url: new URL(url).toString().replace(/\/$/, ""), out, chromium, expect };
}
