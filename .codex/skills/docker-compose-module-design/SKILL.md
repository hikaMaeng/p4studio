---
name: docker-compose-module-design
description: Enforce the repository Docker contract: Docker-first runtime, one root docker-compose.yml, module-owned Docker assets, apps service-module to container mapping, isolated networking, Docker socket passthrough for container-spawning services, a standard npm deploy entrypoint, and runtime-only Dockerfiles that copy prebuilt local dist artifacts instead of building the project. Use when defining compose services, Dockerfiles, networks, volumes, env_file wiring, deploy scripts, Docker socket access, or container ownership.
---

# Docker Compose Module Design

Enforce orchestration-only compose. Enforce non-build Dockerfiles. Enforce one deploy entrypoint.

## Ownership

* Primary runtime: Docker.
* Root `docker-compose.yml`: only orchestration entrypoint.
* Container ownership boundary: `apps/*` or `packages/*`.
* If an app service module owns a service, compose sees that module as one container.
* Any container-owning module requires `docker/` as the single module-owned Docker root.
* `apps/<service>/docker/` must contain all Docker-related files for that service: the `Dockerfile`, the env template, and any compose-local assets.
* Env files are never committed. The committed artifact is a template whose name does not match `.env*` (`docker/env.defaults`), because secret scanners and push protection reject `.env*` regardless of content. The local `docker/.env` is git-ignored and generated from that template by the scaffold installer and by the deploy entrypoint, so a fresh clone stays deployable.
* Declare the env file as `required: false` in compose and keep the image's own `ENV` defaults, so a missing local file degrades instead of breaking `docker compose config`.
* Prefer named volumes declared in root compose. When a service needs bind-mounted content instead, that content lives under `apps/<service>/docker/volumes/`, with subfolders as needed, and nowhere else.

## Compose

* Root compose integrates module containers only.
* Do not run containers outside root compose flow.
* Root compose should depend on module-owned `apps/<service>/docker/` assets, not duplicate service-local Docker files at repo root.
* Use `env_file`, named volumes, explicit networks.
* Default network: one project-scoped network that no other compose project joins. Publishing a port to the host is allowed; joining another project's network is not.
* Cross-project connectivity: a single named `external: true` network only; keep every other service on the project-scoped network.
* Keep build context minimal.
* If a container may create or control Docker containers, mount the host Docker
  socket in that service:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

This reuses the host Docker daemon instead of creating nested Docker-in-Docker
container layers. Require this mount for compose services that
run agents, tools, CI workers, build workers, or any process likely to invoke
Docker from inside the container. Do not add a Docker daemon inside the image to
solve this problem.

## Deploy Entry

* Prefer one standard entrypoint: `npm run deploy`.
* `npm run deploy` must finish local build first, then refresh the target stack through compose.
* Treat the server produced by `npm run deploy` as the only valid test target by default.
* Prefer invoking `npm run deploy` over instructing separate manual build and compose commands.
* A Docker deploy request means local build plus Compose refresh. Do not skip the
  local build unless the user explicitly asks for container restart only.

## Dockerfile

* Dockerfile is not a project build script.
* Do not install project dependencies, run Turbo, npm build, Vite build, TS compile, or equivalent project-build logic.
* OS packages and global image-owned tools such as the Docker CLI, Chromium, or Playwright may be baked into the image when the service runtime contract requires them.
* Copy already-built local artifacts, especially `dist/`, plus minimal runtime files only.
* If `dist/` is absent, build elsewhere first; never build inside the Dockerfile.
* Runtime start only.

## How the container runs

What the image contains is only half the contract. These are invisible until
something goes wrong in production, so they are checked mechanically.

* **Non-root.** Declare `USER` with the unprivileged account the base image
  ships (`node` on the official images) and `COPY --chown` to it. Nothing in a
  runtime image needs root, and a compromised process should not own the
  filesystem.
* **`HEALTHCHECK`.** Without one, `docker compose ps` cannot report health and
  `depends_on: condition: service_healthy` has nothing to wait on. Probe the
  service's own health endpoint using the runtime already in the image — reach
  for global `fetch` rather than adding curl.
* **Signals.** A server that ignores `SIGTERM` makes every stop, restart, and
  deploy wait out the kill timeout. Handle the signal in the process and close
  the listener; set `init: true` in compose so PID 1 reaps and forwards.
* **`restart: unless-stopped`** for long-running services, so a host reboot or a
  crash does not silently leave the stack down.
* **Volumes are for services that persist data.** Do not declare and mount one
  speculatively: a volume nothing writes to is a claim about durability the
  service does not honor.

## Node runtime version

The runtime contract is the base image, never the developer's local Node. `dist`
is a self-contained bundle copied into that image, so it runs on the image
regardless of what compiled it.

These are genuinely independent, and the difference is not academic: this
baseline's image runs a Node version that the host `engines.node` range
excludes. That is correct, not a contradiction. The exclusion exists because
the *toolchain* installs a dependency tree the build reads from; the image
resolves nothing, because the bundle is already flat on disk. Do not "fix" one to match
the other.

One major version is chosen per service and three places must agree:

| Place | Value |
| --- | --- |
| Dockerfile `FROM node:<major>-*` | the runtime major |
| esbuild `--target=node<major>` | the same major |
| `@types/node` | the same major |

* Choose the supported line with the longest remaining life: the one that is
  Active LTS, or a newer even-numbered line that already has a published LTS
  date. Never an odd-numbered line — those never become LTS — and never a line
  past end-of-life. Pin the major only; never pin the base-image patch.
* "Newest LTS" and "longest supported" can disagree for a few months around a
  release boundary, and the second one is what matters: a line whose LTS date is
  already scheduled outlives the LTS it replaces well before it inherits the
  label. Check with `scripts/check-node-support.sh`, which reports the base
  major against the official schedule.
* Bump all three together or not at all. A `@types/node` major ahead of the image
  types APIs the runtime does not have.
* Image variant: the `-alpine` tag for a minimal runtime; a Debian-slim tag when
  the image needs apt, Playwright, or Chromium.

## Host toolchain Node

The image decides the *runtime* Node. The host Node still decides whether the
build works, and those are different questions with different answers.

* `engines.node` is a set of **bounded windows**, each with a floor and an
  exclusive ceiling. An open-ended branch such as `>=20` admits every future
  release, including ones the toolchain has never run on.
* A bad release is not always the newest one, so the range must be able to
  exclude a middle window, not merely cap a ceiling. Express it as
  `>=a <b || >=c <d` and widen a window only after that version is exercised.
* Why this is not theoretical: a Node release reworked its ESM loader and
  broke package resolution for whole toolchains at once, surfacing as one
  opaque stack trace that named neither Node nor the package manager. A bounded
  range is what turns that into a one-line diagnosis.
* The deploy entrypoint evaluates the running Node against this range before
  doing any work and refuses with the declared range in the message. That check
  is the difference between a one-line diagnosis and an afternoon.
* `engines.node` is the only declaration of the supported range. Do not add a
  second one such as `.nvmrc`: nothing reads it to enforce anything, it pins a
  patch where the contract is a range, and it only creates a file that has to
  be kept in sync with the real rule.
* A range only ever tightens by itself. Nothing notices when the reason for an
  exclusion is fixed upstream, so the project silently ages on a pin nobody
  revisits. `scripts/check-node-support.sh` is the counterweight: it lists the
  current releases the range rejects, and `--node <path>` runs the real build
  under a candidate binary. Widen the range when that probe passes, never on a
  changelog entry, and keep the probe output as the reason in the commit.
* Prefer a maintained line over a high version number. A frozen point on a
  Current line stops receiving security patches the moment that line ends,
  which makes it more stale than an older LTS that still ships releases.

## Output

Return service/container ownership, deploy entrypoint, copied artifacts, compose wiring, rule violations, required fixes.

## Load

Run the mechanical checks first; they parse root `docker-compose.yml` (no Docker
daemon needed) and verify module ownership plus dist-only runtime Dockerfiles for
the compose-referenced services:

```sh
bash .codex/skills/docker-compose-module-design/scripts/check-compose.sh
```

The script locates the repository root from its own position, so it is correct
from any working directory and wherever this skill was copied. Pass a path as
the first argument to check a different repository.

The script scopes the dist-copy rule to compose-referenced Dockerfiles only, so
native/toolchain build Dockerfiles that are not referenced by compose are not
false-positived, and it treats root `docker-compose.<platform>.yml` overrides as
`warn`, not a violation.

Report the emitted `check ... status=violation detail=...` lines verbatim and act
on them; do not re-diagnose a rule the script already decided. Then read
`references/checklist.md` for the remaining judgment rules.
