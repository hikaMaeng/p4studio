# Headless Browser Test Operation

Use this when running tests against an actual service and reporting evidence.

## Deployed Service

If the user asks to deploy and test, deploy first with the repository's deployment skill or script. Use the URL printed by the deploy report.

This skill tests this repository's own deployed or running service. The runner uses the URL exactly as given, so resolve one that is reachable from wherever the browser process runs.

If a service is already running, resolve the URL from one of:

* The latest deploy report.
* `docker compose ps`.
* Service docs under `docs/`.
* The dev server output in the active terminal.

Before opening Chromium, verify the resolved URL from the same environment that will run the browser. Success from the other side of a container boundary is not evidence:

```sh
curl -fsS <resolved-url> >/dev/null
```

Run smoke:

```sh
node scripts/run-headless-browser-test.mjs --url <resolved-url>
```

Run scenario:

```sh
node scripts/run-headless-browser-test.mjs --url <resolved-url> --spec <scenario.json>
```

If the target service is reachable through a Compose service name, prefer that URL. If the browser runs outside the network that publishes the port, pass the address reachable from the browser's side. Only a `localhost` origin is a secure context, so the URL choice can change page behavior.

## Artifacts

Default output:

```text
test/YYYYMMDD/<HHMMSS>_headless-browser-test/
  report.json
  report.md
  trace.zip
  screenshots/*.png
```

Use `--out <dir>` when the user requests a specific artifact location.

## Failure Triage

When the runner fails:

1. Read `report.md`.
2. Inspect the failure screenshot path printed by the runner.
3. Check `consoleErrors` and `pageErrors` in `report.json`.
4. Open `trace.zip` with Playwright trace tooling when available.
5. If navigation failed, verify the URL from the same environment with `curl -I <url>` or `curl -fsS <url>`.
6. If the app container must reach a mock or callback server started by the test process, verify that URL from the app container. A host alias can resolve to a different host than the one the mock is listening on.
7. If the locator failed, inspect markup and prefer fixing the UI contract over weakening the test.
8. If a fixed timeout looks tempting, replace it with a specific visible state, URL, response, role, or text assertion.

## Complex E2E

Use the JSON runner for simple click/fill/assert paths. Write a one-off Playwright script under `test/YYYYMMDD/<HHMMSS>_<name>/` when the scenario needs any of these:

* A mock model/provider server or WebSocket choreography.
* Temporary runtime or application settings that must be restored in `finally`.
* Assertions across browser UI, socket messages, model request payloads, server logs, and generated artifacts.
* Scoped locators that the JSON format cannot express cleanly.

For flows driven by a backend exchange, assert both sides of the contract when possible: the browser-visible result and the request sequence that proves it happened for the right reason. If the script writes temporary settings, restore the originals before reporting success.

## Durable Playwright Tests

Use this when the user wants a test committed to the repository instead of one-off browser evidence:

```sh
sh scripts/write-playwright-e2e-template.sh test/e2e
```

Then fill the TODO placeholders in:

```text
test/e2e/playwright.config.ts
test/e2e/tests/smoke.spec.ts
```

The generated test starts a fresh browser context per test, uses role/label/text locators, records trace on first retry, captures screenshots only on failure, and keeps the base URL configurable through `E2E_BASE_URL`.

Run it with whichever Playwright CLI the environment provides:

```sh
E2E_BASE_URL=<url> playwright test -c test/e2e/playwright.config.ts
```

## Final Answer

Include:

* Pass/fail.
* Tested URL and final URL when different.
* Whether this was smoke-only or scenario-based.
* Report path.
* Screenshot paths.
* Browser console/page errors, summarized.
* Any temporary settings, mock servers, or container-network overrides used.

Do not paste the whole JSON report unless the user asks.
