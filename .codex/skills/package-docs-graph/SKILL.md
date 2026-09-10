---
name: package-docs-graph
description: Enforce the repository package documentation contract as a navigable dependency graph. Use when creating or updating package README, docs pages, navigation tables, architecture router, API docs, usage docs, constraints, blast-radius/consumer records, internals, decisions, or testing docs. Docs exist so a later model drills down from task to edit target with minimal context and sees blast radius before editing. Keep content terse; keep only repo-specific contracts, paths, edges, intent, and decisions.
---

# Package Docs Graph

Docs are a navigable dependency graph, not prose. Their job: let a later model
reach the exact edit target, understand why it exists, and see what breaks —
without reading the whole package.

Optimize for retrieval and blast-radius awareness, not pedagogy.

## Two jobs every doc serves

1. Drill-down: reach the right file/symbol cheaply, stopping early.
2. Blast radius: know consumers and invariants before editing, so a precise
   change does not ripple.

A doc that does neither is noise; delete it.

## Required structure

* Every package: `README.md` + `docs/`.
* README first line: one-line summary. README is an index only.
* README nav table links every required doc (exact shape in `references/templates.md`).
* Required doc set: `overview`, `architecture`, `api`, `usage`, `constraints`,
  `internals`, `testing`.
* `architecture.md` is the router node: a `path -> contract` table mapping each
  top-level source partition to its responsibility. Drill-down starts here.
* Domain docs beyond the required set are allowed; add one nav-table row each.
* Large packages: co-locate a sub-node doc with a source subtree (e.g.
  `src/agent/README.md`) so a model loads only that subtree, not the whole
  package `api.md`. Keep package `docs/` as the index that links sub-nodes.

## Graph edges (the part that makes it a graph)

* Doc -> code: link down to `path/file.ts#symbol`, not just a directory.
* Code -> doc: a comment anchor pointing back, e.g. `// see docs/x.md#section`.
  Place anchors only where a non-obvious contract or decision lives.
* Both directions must exist for any contract worth documenting; a one-way link
  is a dead end for the session that entered from the other side.

## Blast radius (required, usually missing)

* For each exported subpath, record in `constraints.md`:
  * Consumers — who depends on this surface.
  * Invariants — what callers rely on that a change must not break.
* This is the edge set a model uses to bound a change. Without it the model
  greps globally and the docs failed their purpose.

## Design intent (protect from the terseness rule)

* `internals.md` keeps a Decisions/Invariants list: one line per decision +
  one line of why.
* Drop generic explanations the model already knows. Keep only non-obvious
  intent specific to this repo. Terse and intent-preserving do not conflict
  when intent has its own bounded slot.

## UI packages

* If a package renders UI, document the browser-test locator contract in
  `constraints.md` and `testing.md`: approved test ids (as a list/table),
  landmarks and roles, accessible naming, and known exceptions. A generic
  "uses semantic markup" line does not satisfy this. Defer to the
  `headless-browser-test` skill for the contract shape.

## Freshness (a stale doc is worse than none)

* A model trusts docs to avoid reading code; a confidently wrong doc causes the
  exact ripple this contract prevents.
* Update the covering doc section in the same change as the source it describes.
* Keep `architecture.md`'s path table in sync with real `src/*`; treat drift as
  a defect, not a style nit.

## Writing rule

* README index-like and short.
* Durable contracts in docs, not comments.
* JSDoc only where an exported API needs a durable contract not already clear
  from its name and type.
* TypeDoc optional; never commit generated output.

## Output

Return: missing docs, generated/updated docs, structural gaps, missing graph
edges (doc->code / code->doc), missing consumer/invariant records, and any
path-table drift found.

## Load

Run the mechanical check first — it is the authority on the countable rules
(required-doc presence, README nav-table completeness, and architecture.md
path-table drift vs real `src/*`), so you never prose-audit those by hand:

```sh
bash .codex/skills/package-docs-graph/scripts/check-docs.sh
```

The script locates the repository root from its own position, so it is correct
from any working directory and wherever this skill was copied. Pass a path as
the first argument to check a different repository.

Structured output (`check pkg=<p> name=<rule> status=...`, final
`docs-check status=... violations=N`, non-zero exit on any violation) tells you
exactly which package/doc to fix. Add `--include-apps` to also scan JS/TS apps.
Fix every reported `violation` before writing prose.

If writing, copy structure from a package in this repository that already
passes the check rather than regenerating it — keep the nav-table columns and
required rows byte-for-byte. Read `references/templates.md` for the per-node
shapes (architecture router table, constraints blast-radius, internals
decisions).
