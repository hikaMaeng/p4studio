# Checklist

* TS stable; Turbo + npm workspaces present
* task `inputs` / `outputs` explicit; remote-cache strategy documented
* root `package.json` declares `workspaces` for `apps/*` and `packages/*`
* no workspace `node_modules` dependency path is required
* no non-npm lockfile or workspace-manager configuration
* `package-lock.json` committed; installed with `npm ci`
* no one-line private helper that only renames an expression, method call, regex, normalization, or filename sanitization
* no file-local helper called once unless it isolates parsing, validation, persistence, network IO, a nontrivial algorithm, or a real domain invariant
* no nested helper decomposition without concrete duplication, a second caller, or a meaningful boundary
* one folder per bounded concern; a family of like units gives each member its own `<family>/<member>/` folder
* folder granularity tracks rate of change, not line count: two things that change for different reasons are two folders
* files inside a folder split by role (entry, pure logic, config/types, tests)
* no class used as a namespace or without identity, mutable lifecycle, polymorphism, or resource ownership
* classify target: `apps/` or `packages/`
* apps may depend on packages; packages never depend on apps
* reject app->package boundary violations
* workspace-name imports only
* one service per app module
* require `src/server` + `src/front`
* require exactly one paired `packages/<service>_domain` per `apps/<service>`
* reject additional domain-related packages for the same app
* domain package has `src/common`, `src/server`, and `src/front`
* domain logic and invariants live in the paired domain package, not in app lifecycle wiring
* wire shapes (request/response/snapshot/event) live only in `src/common/protocol/<purpose>/`, one purpose per folder with an `index.ts` barrel
* `common/protocol/**` imports nothing from `src/front`, `src/server`, or a feature model
* no `*Snapshot`/`*Response`/`*Request`/`*Event` wire type under `src/front` or `src/server`
* server builds payloads `satisfies <Wire>`; client parses inbound via `parse<Wire>()`, never `as <Wire>`
* model imports wire types from protocol, never re-declares them; no inline `request<{…}>` or `res.json({…})`
* non-domain packages remain cohesive and standalone unless a durable shared abstraction requires a dependency
* Vite-built front, Express-served prod front
* FE independently buildable
* final container target = server runtime
* exact versions only
* framework deps in package `peerDependencies`
* `main`/`module`/`types` -> `dist/`
* tsconfig path == package name
* standard deploy script = `npm run deploy`
* deploy wraps local build + compose refresh
* no hardcoded port; env range `10000-59999`
* `docker/env.defaults` committed; `docker/.env` generated and git-ignored
* env validated before use
