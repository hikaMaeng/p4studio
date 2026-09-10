# Headless Browser Test Environment

Use this when deciding whether the current environment can run browser tests,
and which URL to point them at.

## Required Runtime

The test runner needs:

* A current Node.js LTS or newer.
* A Chromium executable.
* The `playwright` Node package, resolvable from the workspace or from a global
  install in the runtime image.

The runner resolves these itself, in this order:

| Need | Resolution order |
| --- | --- |
| `playwright` | workspace resolution, then `HEADLESS_BROWSER_PLAYWRIGHT_ROOT` |
| Chromium | `HEADLESS_BROWSER_EXECUTABLE`, then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, then Playwright's own bundled browser |

If it cannot resolve one, it fails with the missing component named. Keep that
line in the final answer: the missing component determines the next action.

## Execution Context Matters

Whatever runs the browser is what must have the browser. A check run in a
different shell or container cannot see packages that are local to the image
where the test will actually execute — run it where the test runs.

## Missing Runtime Policy

Do not install anything before the runner reports what is missing.

* A container image that is expected to supply Chromium or Playwright but does
  not is an image defect. Report it; do not patch around it by adding a
  workspace dependency for one-off browser evidence.
* If the runtime provides them globally, point the two environment variables
  above at that installation instead of installing again.
* If the user explicitly asks for a durable project-owned suite and the package
  is genuinely absent, add it with the repository's package manager and keep
  the lockfile change intentional:

```sh
npm install -D playwright        # one-off runner
npm install -D @playwright/test  # durable Playwright Test suite
```

* If the user wants local workstation testing and Chromium is missing, ask
  before installing OS packages.

## URL Rules

The URL is an input. The runner does not rewrite it, so it must already be
reachable from where the browser process runs.

* Prove it before testing: `curl -fsS <url> >/dev/null` from that same
  environment. A URL that resolves on one side of a container boundary is not
  evidence that it resolves on the other.
* If the target is in the same Docker Compose network as the browser, prefer
  its compose service DNS name over host-port routing.
* If the browser runs in a different container from the published port, use the
  address that container can reach — commonly a host alias such as
  `host.docker.internal`, or the container gateway from `/etc/hosts`. Confirm
  with `curl` from that container first.
* Origin security is part of this choice: a page served from `localhost` is a
  secure context and one served from another hostname is not, so APIs such as
  Web Crypto can work under one URL and fail under the other. Pick
  deliberately and record which URL was tested.

```sh
node scripts/run-headless-browser-test.mjs --url "$APP_URL"
```

## When To Start A Server

If the requested page is a local app and no server is running, start it through
the repository's documented workflow — the deploy path for Docker checks, the
package scripts for dev-server checks.

Do not invent ports. Take them from the deploy report, the service docs, the
running process output, or `docker compose ps`.
