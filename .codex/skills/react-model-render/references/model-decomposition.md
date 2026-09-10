# Model Decomposition (worked pattern)

The scaffolding assets show one small `SessionModel` for teaching. A real
feature model is not one file — it is a **two-tier layer decomposed by role into
many small files**, each owning one slice, so a change to one slice re-renders
only its subscribers and a maintainer edits one named file instead of scrolling a
god-object. This is the shape that Invariant 5 (submodels route independently)
actually produces at scale.

Reproduce the taxonomy below, not a single `Model.ts`. The file names in the
tables are illustrative roles; use the names your feature actually needs.

## Tier 1 — base primitives (shared by every feature)

`packages/<service>_domain/src/front/model/`

| File | Role |
| --- | --- |
| `Emitter.ts` | subscribe / getVersion / emit — the render trigger. |
| `SliceModel.ts` | `SliceModel<T>` — one value + its own Emitter; `set` / `mutate`. |
| `config.ts` | cross-feature model config/constants. |
| `form.ts` | reusable form/input slice helpers. |
| `modelRender.test.ts` | tests the primitives (subscribe/emit/no-tear). |

## Tier 2 — one folder per feature, decomposed by role

`packages/<service>_domain/src/front/<feature>/model/`

Split a feature model into these file roles (add only the ones the feature needs):

| File role | Example files | Contract |
| --- | --- | --- |
| Per-slice model + factory | `connection.ts`, `editor.ts`, `list.ts`, `selection.ts`, `viewport.ts`, `identity.ts` | Each exports `create<Slice>Model()` + a `<Slice>Model` type. One slice = one Emitter. |
| Pure reducers | `listReducer.ts`, `eventReducer.ts` | `apply<X>(model, event)` pure functions; no React, no IO. Keep event→state math out of the slice file. |
| Instance store / registry | `store.ts`, `liveStore.ts` | id-keyed live registry (`ensure<Feature>Model`, `get<Feature>ModelStore`). Lifecycle outside React (Invariant 4). |
| Lifecycle factories | `create.ts` | draft/promote/from-row constructors for the aggregate instance. |
| Types | `types.ts` | `<Feature>InstanceModel`, `<Feature>ModelSnapshot`. |
| UI projection adapter | `uiAdapter.ts` | `modelToUiState()` — derived read-only view; not stored state. |
| Barrel | `index.ts` | re-export the public factories/types; app imports only from here. |

## App side stays thin

`apps/<service>/src/front/`

The app holds only React glue and components — **never** model data:

- `model/useModel.ts` — the single `useSyncExternalStore` bridge (one file).
- `<feature>/{area,components,hooks,modals,socket}/…` — feature-first UI folders
  where each region owns the state it renders (Layer 2). One folder per feature,
  and inside it one folder per region that subscribes independently.

Cross-package imports use the workspace name and the barrel, e.g.
`import { Emitter } from "<service>_domain/front"`, never a relative
`../../packages/...` path.

## Why decompose this far

- **Render isolation is physical, not conceptual**: one slice per file/Emitter
  is what makes "typing in one field does not re-render the list beside it"
  true, and reviewable in a diff.
- **Blast radius is bounded**: a reducer bug is one `*Reducer.ts`; a lifecycle
  bug is `store.ts`/`create.ts`. The maintainer opens one named file.
- **Reducers are unit-testable** without React because they are pure and
  separated from the slice they feed.

## Reject

- One `FeatureModel.ts` holding every slice, requiring a full re-render or
  manual sub-notification on any change.
- Reducer logic inlined into slice setters (untestable, re-renders too much).
- The registry/store living in a component or in `useState`.
- A `uiAdapter` result stored back on the model instead of computed on read.
