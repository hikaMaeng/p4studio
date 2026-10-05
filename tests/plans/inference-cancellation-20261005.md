# Test Plan: inference-cancellation

## Created

2026-10-05, Asia/Seoul.

## Goal

Streaming results must offer a stop beside delete. Stop prevents further waves and cancels unfinished P4 requests on the original submission connection. Both model and individual-node UNLOAD must stop related browser-local inference before their own lifecycle command.

## Environment

Native Windows PowerShell in the Studio checkout; npm workspaces + Turbo. P4 checkout is reference-only. Headless Chrome and Playwright are supplied by the host runtime. Use a separate temporary SQLite database and empty agent tunnel configuration for the dev server; intercept fixture HTTP/P4 responses in fresh browser contexts.

## Preconditions

- Record both repository HEADs and dirty state. Preserve unrelated P4 evidence directories.
- Read current P4 CancelCommand, head worker cancellation, ERROR/RELEASE payloads and event-drive producer/tests. Do not claim immediate native GPU/KV stop from a logical terminal.
- Start `npm run dev --workspace=@p4studio/studio` with `P4STUDIO_SQLITE_PATH` pointing to a temporary database and `P4STUDIO_AGENT_TUNNELS=[]`. Use the Vite URL printed by that process. Prove it reachable from Windows before launching the browser.
- Set `HEADLESS_BROWSER_EXECUTABLE` and `HEADLESS_BROWSER_PLAYWRIGHT_ROOT` to the available Chrome/runtime paths. Browser fixtures never send to real agents.

## Steps

1. Run `npm run typecheck`, `npm test`, `npm run build`; retain stdout and exit codes.
2. Run repository i18n, architecture and documentation graph checks. Distinguish pre-existing failures.
3. Run the headless-browser skill smoke script with the resolved URL.
4. Run `node tests/reports/inference-cancellation/tools/browser-check.mjs --url <URL> --out tests/reports/inference-cancellation/evidence`.
5. Inspect screenshots for running/cancelling/cancelled cards and model/node UNLOAD outcomes.
6. Verify `git diff --check` and both checkout states; do not modify or deploy P4.

## Expected Results

- Streaming: stop visible next to disabled delete; cancelling disables duplicate actions. Each unfinished original PREFILL gets one matching Control CANCEL. RELEASE and terminal are separate, and delayed approved text remains. No future wave; terminal history can be deleted.
- Interval: stop interrupts a 60-second interval, keeps completed requests, sends no CANCEL for them and no next PREFILL.
- Preparing: stop during SESSION prevents every PREFILL, including after late SESSION_READY.
- Model/node UNLOAD: first cancel both in-flight requests, wait for delayed RELEASE, then issue two model stage UNLOADs or one selected-node UNLOAD. Assert exact endpoint/generation and successful lifecycle receipt. Leave unrelated node present.
- Unit counterexamples: queued cancellation refusal, natural completion race, stale route/identity/incarnation, RELEASE before terminal, held OUTPUT gap, missing settlement -> unknown, shared-node lock, pending SESSION proof write and active deletion guard.

## Logs To Capture

Commands/exit codes, unit summaries, skill check output, smoke report, scenario `browser-report.json` with dispatched event IDs and timing, screenshots, browser console/page errors. Final report must identify mocked P4 and the absence of real GPU/distributed acceptance or production deployment.

## Locator Contract

Use role/name, label and documented test IDs. Scope `inference-run-stop` / `inference-run-delete` / `inference-run-summary` to `inference-run-group`; use `model-row` / `model-row-status`, `agent-row`, named node tab and named UNLOAD dialog. No arbitrary CSS selectors. Contexts and localStorage are fresh for each scenario.
