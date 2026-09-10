# README

First line is a one-line summary. Nav table links every required doc — same
columns, all rows, every time.

```md
one-line summary of the package

| Goal | File |
| --- | --- |
| Understand purpose | docs/overview.md |
| Architecture (router) | docs/architecture.md |
| API reference | docs/api.md |
| Usage | docs/usage.md |
| Constraints & blast radius | docs/constraints.md |
| Internals & decisions | docs/internals.md |
| Testing | docs/testing.md |
```

Add one row per extra domain doc. Keep columns `Goal | File`.

# architecture.md (router node)

`path -> contract` table over the top-level source partition. This is where
drill-down begins; keep it in sync with real `src/*`.

```md
# Architecture

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/common` | Runtime-neutral domain code shared by server and front. | `src/common/index.ts#<symbol>` |
| `src/server` | Server-only domain rules and invariants. | `src/server/index.ts#<symbol>` |
| `src/front` | Front-only domain code; owns no app UI composition. | `src/front/index.ts#<symbol>` |
```

# constraints.md (blast radius)

Per exported subpath: who depends on it, and what must not break.

```md
# Constraints

## Blast radius

| Subpath | Consumers | Invariants (do not break) |
| --- | --- | --- |
| `<pkg>/server` | `apps/<service>` server wiring | Validates its own inputs; never trusts a caller-supplied identifier. |
| `<pkg>/common` | every package surface, `apps/<service>` | Stays runtime-neutral; no node or browser globals. |

Packages must never import from `apps/`.
```

# internals.md (decisions / intent)

```md
# Internals

## Decisions

* State that two surfaces read lives in `src/common`, not duplicated per
  surface — keeps one source of truth when the rule changes.
* Filesystem or config layout resolved through one helper — single place to
  change the layout.

Add internals only when implementation detail affects future maintenance.
```

# Required docs

* `docs/overview.md` — purpose, invariants, ownership boundary.
* `docs/architecture.md` — router `path -> contract` table.
* `docs/api.md` — exports grouped by subpath, each linking to `file.ts#symbol`.
* `docs/usage.md` — import surface and boundary rules.
* `docs/constraints.md` — blast radius (consumers + invariants), UI locator
  contract for UI packages.
* `docs/internals.md` — decisions and non-obvious intent.
* `docs/testing.md` — how to verify; UI test-id/landmark contract if UI.

# Check

* README summary line present.
* Nav table links every required doc, columns `Goal | File`.
* architecture path table matches real `src/*` (no drift).
* Every documented contract has a doc->code link to `file.ts#symbol`.
* Non-obvious contracts/decisions have a code->doc comment anchor.
* constraints records consumers + invariants per exported subpath.
* internals records decisions with one-line why.
* UI packages: approved test ids + landmarks recorded, not a generic line.
* README stays short; docs stay terse.
