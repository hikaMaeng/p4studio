---
name: web-deploy-docker
description: Deploy contract for a Dockerized web service - one entrypoint, local build before compose refresh, published-port and health verification, and a machine-readable deploy report. Use when running, writing, reviewing, or debugging the repository deploy path.
---

# Web Deploy Docker

## Immediate Action

Deploy through the repository entrypoint from the project root:

```sh
npm run deploy <service>
```

The entrypoint is repository-owned and must be implemented by a portable
runtime available to the project (normally Node.js or POSIX shell). It must not
assume a service name, operating system, shell, container name, port variable,
volume name, database path, or project-specific environment variable. If the
Compose file has one service, the service argument is optional; with multiple
services it is required. A target service is selected by its Compose service
name, never by an application-specific alias.

Do not substitute an ad-hoc sequence of `npm run build` plus `docker compose up`
for the entrypoint. If the entrypoint is wrong for this repository, fix the
entrypoint.

## Input

* Optional: a Compose service name when exactly one service exists.
* With multiple services, require the service name and reject unknown names.
* Support explicit portable overrides such as `--health-path`,
  `--health-timeout-ms`, `--compose-file`, and `--force`; environment variables
  may provide defaults but must not be the only way to configure them.

## The Contract

A deploy path satisfies this skill when all of the following hold.

1. **Local build first.** The project is built on the host, then the stack is
   refreshed through compose. Building inside the Dockerfile violates the
   `docker-compose-module-design` runtime-image contract.
2. **Compose owns the image build.** Images are produced with
   `docker compose build`, never a bare `docker build`: compose owns the build
   args and the image name declared for the service.
3. **Config is validated before refresh.** An invalid `docker compose config`
   fails the deploy with its own reason instead of surfacing later as a
   container error.
4. **The published port is verified.** An empty port mapping, a port of `0`, and
   an `invalid IP:0` mapping are failures, not warnings.
5. **Health is verified over the published port.** Discover the first valid
   Compose port mapping and probe the configured health path through portable
   host candidates. A deploy that never proved a response is not successful.
6. **The run is idempotent.** Do not reinstall dependencies, rebuild local
   artifacts, or recreate an unchanged service. Report `already-current` when
   fingerprints and runtime state prove no refresh is needed. A `--force` mode
   may bypass this optimization explicitly.
7. **The fast path targets ten seconds.** On a warm dependency tree, unchanged
   build output, running container, and healthy endpoint, resolve, verify, and
   report without `install`, `build`, or image refresh. The ten-second target is
   a performance objective, not permission to omit health or configuration
   verification.
8. **Everything lands in one report block** (below). A deploy that succeeds
   silently cannot be reviewed.

## Report Shape

The entrypoint prints phase lines while running:

```
deploy-phase phase=<resolve|install|build|compose|verify> status=<...> elapsed_ms=<n> ...
deploy-summary service=<s> refresh=<...> port=<...> port_reason=<...> health[<path>]=<ok|failed>
```

and closes with one block:

```
deploy-report-begin
result: status=<ok|failed> services=<...> compose=<refreshed|already-current|failed>
time: total=<n>ms resolve=<n>ms install=<n>ms build=<n>ms compose=<n>ms verify=<n>ms
verify: <one line per service and per health probe>
changed: files_edited=<...>
deploy-report-end
```

Base the final answer on that block and carry its four summary lines
(`result`, `time`, `verify`, `changed`) into the answer.

## Failure Handling

* Report the emitted reason exactly. `compose-config`, `published-port-missing`,
  and `published-port-invalid` each name a specific defect; do not replace one
  with a generic "Docker daemon problem" diagnosis.
* The entrypoint owns its own recovery paths, dependency bootstrap included. A failure that already printed a report block is not a reason
  to re-run install, build, or compose by hand.
* Edit files only when the deploy failed because of a concrete defect in this
  repository, and name the file and the reason.

## Output

Return: deploy result, elapsed time, per-service port and health evidence, and
files changed. If the deploy failed, return the failing phase and its reason.
