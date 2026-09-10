---
name: web-deploy-docker
description: Deploy contract for a Dockerized web service - one entrypoint, local build before compose refresh, published-port and health verification, and a machine-readable deploy report. Use when running, writing, reviewing, or debugging the repository deploy path.
---

# Web Deploy Docker

## Immediate Action

Deploy through the repository entrypoint:

```sh
npm run deploy <service>
```

`scripts/deploy.sh` is the implementation and this repository owns it. `--all`
deploys every compose service; run it only when the user asks for all services.
The entrypoint accepts both `<service>` and `apps/<service>`.

Do not substitute an ad-hoc sequence of `npm run build` plus `docker compose up`
for the entrypoint. If the entrypoint is wrong for this repository, fix the
entrypoint.

## Input

* Required: a service name, unless the user asked to deploy everything.
* If the repository defines exactly one compose service, the entrypoint resolves
  it with no argument.
* If the service name is missing and more than one exists, ask for the service
  name only. Do not infer it and do not ask for a target directory.

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
5. **Health is verified over the published port.** Do not assume `127.0.0.1` is
   the Docker host; try the valid host candidates. A deploy that never proved a
   response is not a successful deploy.
6. **The run is idempotent.** An unchanged service is reported as
   `already-current` instead of being rebuilt.
7. **Everything lands in one report block** (below). A deploy that succeeds
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
