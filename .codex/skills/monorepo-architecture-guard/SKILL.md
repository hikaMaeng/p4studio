---
name: monorepo-architecture-guard
description: "Enforce the repository monorepo contract: TypeScript latest stable, Turbo plus npm workspaces, exact versions, package and app boundaries, domain-package shape, client/server protocol contracts, env-schema usage, and React plus shadcn/ui plus Express wiring. Use when creating or reviewing packages, app service modules, package.json, tsconfig, workspace imports, wire/protocol types, env handling, or frontend/backend integration."
---

# Monorepo Architecture Guard

Apply repo-only constraints. Skip generic coding knowledge.

## Stack

* TS latest stable.
* Turbo monorepo; define task `inputs`/`outputs`; document remote-cache strategy in root README.
* npm workspaces: root `package.json` declares `workspaces` for `apps/*` and `packages/*`; `package-lock.json` is committed and installed with `npm ci` in CI and deploy.
* One package manager: npm only. Keep only `package-lock.json` and root `workspaces` metadata. Reject every non-npm lockfile or workspace-manager configuration. Plain `node_modules` is chosen for tool compatibility over checkout size: every bundler, test runner, and editor already implements Node resolution, whereas archive-based layouts fail as a crash inside a package the project never named.
* Workspace deps are declared by package name with `"*"`; npm links the local workspace.
* Reuse checks search source repos directly; no package-catalog service.

## Boundaries

* `packages/`: framework-agnostic libraries only. `apps/`: service modules only — no business logic in wiring-only shells.
* Apps may depend on packages; packages never on apps. Never import `apps/` into `packages/`.
* Cross-package imports use workspace names, never relative cross-package paths.
* Apps own orchestration, framework lifecycle, HTTP/static serving, and wiring. Domain rules, invariants, cross-request state, and framework-independent logic live in the paired domain package — never hidden in a generic shared package.

## Code Shape

* Keep code direct; no function, class, or file whose abstraction is effectively just its name.
* Prefer one clear top-level function over a chain of single-use private helpers. First-level decomposition is fine; nesting needs real duplication, a second caller, or a genuine boundary (parsing, validation, persistence, network IO, a nontrivial algorithm).
* No helper for one expression, call, regex, `trim`/`toLowerCase`, or sanitization line; a file-local single-use helper is a violation unless it isolates such a boundary.
* Avoid classes without identity, mutable lifecycle, polymorphism, or resource ownership.

## Service Module

* One service = one app module: `apps/<service>/src/server` + `apps/<service>/src/front`, paired with exactly one `packages/<service>_domain`. No extra domain package for the same app.
* `src/front` is Vite-built and independently buildable; prod serves it from `src/server` (Express). The deployable/container target is the server runtime artifact.

## Package Rules

* Domain package shape: `packages/<service>_domain/src/common` (with `common/protocol/`), `src/server`, `src/front`. `common` is runtime-neutral; `server` never imports `front`; `front` never owns app UI composition.
* Non-domain packages stay cohesive and standalone. No phantom deps; declare every used dep; exact versions only.
* Framework deps (`react`, `tailwindcss`, `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`) go in `peerDependencies`.
* `main`/`module`/`types` → `dist/`; `tsconfig` path names == workspace package names; Node resolution must work without tsconfig-only aliasing.

## Protocol

Client↔server wire shapes are a **contract, not model state**. They live in the domain package's `src/common/protocol/<purpose>/` — one folder per purpose, each with an `index.ts` barrel — and nowhere else.

* Every wire shape is a named type there: request bodies, responses, snapshots, and event unions. No inline `request<{…}>` on the client, no `res.json({…})` object literal on the server, and no `*Snapshot`/`*Response`/`*Request`/`*Event` type under `src/front` or `src/server`.
* `common/protocol/**` is pure: it imports nothing from `src/front`, `src/server`, or a feature model. It is the dependency sink both sides reach.
* Both sides depend on it and the model derives from it — the server builds each payload `satisfies <Wire>`, the client validates inbound with a `parse<Wire>()` guard (never `as <Wire>`), and the model imports the wire type instead of re-declaring it. A protocol edit then fails to compile on both the server payload and the model, which is the only thing that keeps the two from drifting apart.
* Bind a route to its types in the protocol folder (path, method, request, response) and import that binding on both the client and the route handler, so a path or shape change cannot land on one side only.
* Worked correct/incorrect pair: `references/protocol.md`.

## Runtime

* FE stack: React + shadcn/ui + Tailwind + Radix primitives (verify major compat on bumps); use shadcn/ui by default — no second UI framework unless the user overrides.
* Dev: explicit Vite proxy to BE on separate ports. Prod: BE serves built FE. BE: Express only.
* Ports from env only, range `10000-59999`; a Dockerfile may set the image default `PORT` and compose may publish it, but no source file embeds a port literal. Read env only after schema validation.

## Concern Decomposition

Most damage comes from **modification**, not the first write: a moving domain drives many small edits, and against a badly divided tree each one degrades the structure until regenerating no longer recovers it. Folders are the fix a file is not — a file boundary a model rewrites or merges on contact, while a folder boundary contains the edit, so a bad regeneration is reverted by dropping one directory.

* One folder per bounded concern, not a god-file. A family of like units (each tool, hook, pipeline phase, route feature) gives each member its own `<family>/<member>/` folder.
* Granularity follows **rate of change**, not line count: two things that change for different reasons are two folders even when both are small.
* Inside a folder, split by role — entry (`index.ts`), pure logic (reducers/validators/parsers), config/types, tests — each a file. Front feature state follows the same rule; see `react-model-render` and its `references/model-decomposition.md`.
* Decompose to isolate a real boundary, not to inflate file count; the Code Shape rules still bind. As calibration this shape runs ~2 files per folder; folders routinely holding ten are tracking size, not change rate.

## Output

Return violated rules, affected files, required fixes, residual risk.

## Load

Run the mechanical checks first; they cover the greppable subset (workspaces, lockfile, competing package managers, `packages/*`→`apps/*` reverse imports, `apps/<svc>`↔`packages/<svc>_domain` pairing, exact versions, protocol purity/structure, and wire-shapes outside `common/protocol`):

```sh
bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh
```

The script locates the repo root from its own position, so it is correct from any working directory and wherever this skill was copied; pass a path to check a different repository. Foreign-runtime apps (no `package.json`) are auto-exempted from the pairing rule; add more with `ARCH_RUNTIME_ONLY_APPS="a b"`.

Report the emitted `check … status=violation detail=…` lines verbatim and act on them; do not re-derive a rule the script already decided. Then read `references/checklist.md` for the judgment rules the script cannot decide, and `references/protocol.md` when a wire contract is involved.
