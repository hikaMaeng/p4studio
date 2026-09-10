---
name: headless-browser-test
description: Run headless browser smoke and E2E tests for a web service. Use when verifying rendered web UI, checking browser errors, creating Playwright-style scenarios, collecting screenshots, or testing a deployed or local service through Chromium.
---

# Headless Browser Test

Use the scripts first. Keep prompts short; let them enforce browser setup,
artifacts, trace capture, and report shape.

The target URL is an input to this skill, never something it guesses or
rewrites. Resolve a URL that is reachable from wherever the browser process
runs, prove it is reachable, then test it.

## Default Flow

1. Resolve the target URL from the user, the deploy report, service docs, or
   the local dev server output.
2. Prove the URL is reachable from the same environment that will run the
   browser:

```sh
curl -fsS <url> >/dev/null
```

3. Run a smoke test:

```sh
node .codex/skills/headless-browser-test/scripts/run-headless-browser-test.mjs --url <url>
```

4. For real E2E, write a small JSON scenario and run it with `--spec`.
5. If the user asks for durable repository tests, generate a Playwright template
   and fill only the marked TODOs:

```sh
sh .codex/skills/headless-browser-test/scripts/write-playwright-e2e-template.sh test/e2e
```

## Load Only What You Need

* `references/environment.md`: runtime requirements, missing Chromium or
  Playwright handling, and choosing a reachable URL.
* `references/scenario-authoring.md`: scenario JSON format, stable locator
  contract, and fill-in templates for common tests.
* `references/operation.md`: testing a deployed service, artifact paths, failure
  triage, and final-answer requirements.

## Hard Rules

* Resolve the browser and Playwright from the environment. If the runtime
  provides them globally, point `HEADLESS_BROWSER_EXECUTABLE` and
  `HEADLESS_BROWSER_PLAYWRIGHT_ROOT` at them rather than adding project
  dependencies for one-off browser evidence.
* A missing browser in a container image is an image problem. Fix the image;
  do not add a workspace dependency to work around it.
* When the browser runs somewhere other than the host that published the port,
  pass the address that resolves from the browser's side. Note that a page
  served from `localhost` is a secure origin and one served from another
  hostname is not, so APIs such as Web Crypto can behave differently — choose
  the URL deliberately and record which one was tested.
* Test rendered behavior a user can see or operate. Do not assert
  implementation details.
* Prefer role/name, label, text, alt text, title, and test id locators. Use
  CSS or XPath only when no stable user-facing or documented test hook exists.
* Keep tests isolated. Do not rely on execution order, shared browser storage,
  or state left by a previous test.
* Avoid uncontrolled third-party pages and services. Mock or constrain them
  when they affect the result.
* Prefer auto-waiting locator actions and web-first assertions over manual
  sleeps or one-shot visibility checks.
* Capture evidence under `test/YYYYMMDD/<HHMMSS>_headless-browser-test/`.
* Final answers must include pass/fail, the tested URL, the report path,
  screenshots, and whether the run was smoke-only or scenario-based.
