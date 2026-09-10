# Headless Browser Scenario Authoring

Use this only when a smoke test is not enough and you need a repeatable E2E path.

The scenario runner is intentionally smaller than full Playwright Test. It is for quick, script-backed verification. For long-lived test suites, use `write-playwright-e2e-template.sh` and convert the scenario into `.spec.ts`.

If the flow requires WebSocket timing, a mock upstream server, temporary application settings edits, or assertions against request payloads, skip the JSON format and write a focused Playwright `.mjs` or `.spec.ts` under `test/YYYYMMDD/<HHMMSS>_<name>/`.

## Scenario Shape

Create a JSON array. Each object is one action:

```json
[
  { "action": "goto", "url": "/" },
  { "action": "assertRole", "role": "main" },
  { "action": "click", "role": "button", "name": "Save" },
  { "action": "screenshot", "name": "after-save" }
]
```

Run it:

```sh
node scripts/run-headless-browser-test.mjs --url "$APP_URL" --spec test/scenario.json
```

## Supported Actions

`goto`

```json
{ "action": "goto", "url": "/admin" }
```

`assertRole`

```json
{ "action": "assertRole", "role": "main" }
```

`assertText`

```json
{ "action": "assertText", "text": "Healthy" }
```

`click`

```json
{ "action": "click", "role": "button", "name": "Refresh" }
```

`fill`

```json
{ "action": "fill", "label": "Email", "value": "ndev@example.test" }
```

`waitForURL`

```json
{ "action": "waitForURL", "url": "**/sessions/*" }
```

`screenshot`

```json
{ "action": "screenshot", "name": "session-open" }
```

Every action may include `timeout` in milliseconds.

## Locator Contract

Prefer locators in this order:

1. `role` plus optional `name`, especially for controls, links, headings, tables, lists, and dialogs.
2. `label`.
3. `text`.
4. `altText`.
5. `title`.
6. `testId`.
7. `css`, only when the UI has no stronger stable contract.

Fill-in examples:

```json
{ "action": "click", "role": "link", "name": "<visible link name>" }
```

```json
{ "action": "fill", "label": "<visible field label>", "value": "<value>" }
```

```json
{ "action": "click", "testId": "<stable-machine-anchor>" }
```

## Markup Requirements For New UI

When creating UI that must be tested:

* Provide one page-level `main` landmark.
* Use native buttons, links, inputs, forms, lists, tables, dialogs, and headings where possible.
* Give icon-only controls accessible names.
* Give forms, dialogs, and submit controls accessible names when tests must target them directly.
* Put row/item actions inside stable row/item containers.
* Expose loading with `progressbar`, `status`, visible text, or a documented `data-testid`.
* Expose errors with visible text and `role="alert"` when immediate attention is intended.

Do not write tests that depend on Tailwind classes, DOM depth, generated ids, or repeated index positions unless no product-visible contract exists and the weakness is stated in the report.

For disclosure UI, remember that `<details>/<summary>` is not a button. Expand collapsed sections through `details:not([open]) > summary` or fix the UI to expose the intended control semantics.

If hidden or collapsed copies of the same text exist, broad text locators can fail strict matching or match the wrong area. Scope assertions to a visible assistant/message/dialog container, or use a final marker that appears only in the expected result and not in the prompt.

## Reliability Rules

* Assert user-visible results after every meaningful action.
* Use specific role/name locators instead of broad text matches for interactive controls.
* Scope repeated items by an accessible container before clicking row or card actions.
* Treat CSS selectors and positional indexes as a documented UI-contract gap, not a normal locator strategy.
* Do not add fixed sleeps. Wait for a visible state, URL, role, text, or documented test id.
* Do not test content from third-party sites unless the service owns that content contract.
* Use unique test data when the scenario writes data.
* A retry may be diagnostic, but a test that only passes after retry is still unhealthy.

## Common Templates

Smoke plus app shell:

```json
[
  { "action": "goto", "url": "/" },
  { "action": "assertRole", "role": "main" },
  { "action": "screenshot", "name": "home" }
]
```

Form submission:

```json
[
  { "action": "goto", "url": "/" },
  { "action": "fill", "label": "<field label>", "value": "<value>" },
  { "action": "click", "role": "button", "name": "<submit label>" },
  { "action": "assertText", "text": "<success or validation text>" },
  { "action": "screenshot", "name": "form-result" }
]
```

Navigation:

```json
[
  { "action": "goto", "url": "/" },
  { "action": "click", "role": "link", "name": "<nav label>" },
  { "action": "waitForURL", "url": "**/<path-fragment>" },
  { "action": "assertRole", "role": "main" },
  { "action": "screenshot", "name": "navigated" }
]
```

Repeated row/card action:

```json
[
  { "action": "goto", "url": "/" },
  { "action": "click", "role": "listitem", "name": "<item label>" },
  { "action": "click", "role": "button", "name": "<action label>" },
  { "action": "assertText", "text": "<result text>" },
  { "action": "screenshot", "name": "item-action" }
]
```

For complex scoping that JSON cannot express cleanly, create a `.spec.ts` or one-off `.mjs` Playwright script instead of weakening locators.
