---
name: react-model-render
description: Use when designing, implementing, reviewing, or refactoring a React front end. Enforces Model Render — the screen is a projection of a pure in-memory model that lives outside React; React state is only an update trigger (never the source of truth); each component subscribes to the smallest model slice it reads. Prevents state-as-source-of-truth coupling, immutable-copy churn, lifecycle leaks, root/global-state ownership, prop/listener meshes, poor partial rendering, and fake refactors that only relocate complexity.
metadata:
  short-description: Model Render + React decoupling
---

# React Model Render

## When this applies

Apply this skill when a view owns state that outlives one component, is read by
more than one region, or is updated from outside React (sockets, timers, API
callbacks). A static or purely presentational view does not need a model layer;
the scaffold baseline ships without one on purpose. Do not introduce the model
layer speculatively — introduce it with the first feature that needs it, then
keep every invariant below.

The screen is a projection of a model. Every effect, event, and API result
updates the model; the model update triggers the render; React computes the
incremental DOM change. React is treated as an efficient incremental renderer,
not as the place where truth lives.

This skill has three layers, in order of authority:

1. **Model Render foundation** — what truth is and how it triggers renders.
2. **Ownership & render isolation** — which component owns and reads which slice.
3. **Refactor criteria & checks** — how to move an existing tree onto this model.

Layer 2 is a corollary of layer 1: once the model is the source of truth and a
component subscribes only to the slice it reads, ownership and partial-render
boundaries fall out naturally.

---

## Layer 1 — Model Render Foundation

### Invariant 1: The model is a pure object that lives outside React

The model is plain in-memory TypeScript with zero React imports. It is never
held in `useState`, never stored as data in context, never copied into props.
A model may be a singleton or instantiated per domain id, and may hold submodels
as ordinary properties. Domain invariants are enforced in the model.

Place models in the domain package, not in app UI code:

- `packages/<service>_domain/src/front/model/` — pure models, submodels, registry.
- `apps/<service>/src/front/` — React glue (`useModel`) and components only.

### Invariant 2: React state is a trigger, not a store

Do not mirror the model into immutable state. The model mutates its fields in
place and bumps a monotonic version counter; React reads that counter as its
snapshot and reads the real data off the live model during render. No immutable
trees, no deep-clone-on-update, no reducer copying.

### Invariant 3: `useSyncExternalStore` is the only bridge

Connect model to React exclusively through `useSyncExternalStore(subscribe,
getVersion, getVersion)`. This is the React-18+ first-class bridge for external
mutable stores and is what prevents tearing under concurrent rendering. Do not
build a bespoke mediator, event bus, or `forceUpdate` hook to route updates.

### Invariant 4: Model lifecycle is independent of component lifecycle

Models live in a registry keyed by domain id, outside the component tree. A
component that unmounts only unsubscribes; the model and its owned resources
(sockets, buffers, request state) keep running. On remount the component reads
the still-living model and the UI restores instantly — no replay or refetch.
Dispose a model only when the domain declares it over, never from `useEffect`
cleanup.

### Invariant 5: Submodels route independently (the tearing contract)

Each submodel is its own Emitter, so a change to one submodel re-renders only
the components subscribed to it. The binding rule that keeps this correct and
tearing-safe:

> A component must subscribe to every model slice it reads in render.

Read `session.messages` → subscribe to the session. Read only
`session.connection` → subscribe to that submodel. Reading a slice whose Emitter
you did not subscribe to yields stale or torn UI. This binding is the "router":
not hand-written plumbing, but the contract that each component's subscription
covers its read set.

### Scaffolding assets

The primitives are stable and known-good; **copy them verbatim, do not
regenerate** (regeneration is where `subscribe`/`emit` and the tearing contract
break). The scaffolder copies them and never overwrites existing files:

```sh
bash .codex/skills/react-model-render/scripts/scaffold-model.sh \
  --domain packages/<service>_domain/src/front/model \
  --app apps/<service>/src/front/model
```

It places the verbatim primitives:

- `assets/model/Emitter.ts` — base trigger: `subscribe` / `getVersion` / `emit`.
- `assets/model/SliceModel.ts` — the per-slice primitive: one value + its own
  Emitter, `set` / `mutate`. Every submodel is a `SliceModel<T>`.
- `assets/react/useModel.ts` — the `useSyncExternalStore` bridge (app side).

Adapt-and-author (read as examples, not copied verbatim):

- `assets/model/SessionModel.ts` — example model + submodel + socket ownership.
- `assets/model/registry.ts` — id-keyed registry; lifecycle outside React.
- `assets/react/SessionView.tsx` — components subscribing to per-slice models.

The single-file `SessionModel.ts` is a teaching simplification. A real feature
model is decomposed by role into many small files (per-slice model, pure
reducer, store, types, ui-adapter, barrel). Read
`references/model-decomposition.md` for the full taxonomy — reproduce that
shape, not one god-object.

Imports across the package boundary use the domain workspace package name
(e.g. `<service>_domain/front/...`), never relative paths across packages.

### Reject at this layer

- Model data stored in `useState`, `useReducer`, `useRef`, or context value.
- Immutable copies / spreads produced only to "trigger" a render.
- A custom subscription/mediator instead of `useSyncExternalStore`.
- Model creation/teardown tied to a component's mount/unmount.
- One component subscribing to a parent model but reading a child submodel.

### Exceptions

- **Ephemeral non-domain state** (focus, hover, uncontrolled input mid-value,
  transient open/close with no domain meaning) stays in component-local
  `useState`. It is not model state.
- **Server cache** (fetched data with loading/error/revalidation lifecycle) is a
  separate axis; do not jam it into the domain model. Keep async lifecycle
  (loading/error/optimistic) as explicit model fields/states only when it is
  genuine domain state the UI projects.
- **Derived values** are computed in a selector/getter, not stored, unless the
  computation is expensive enough to memoize. The model holds normalized truth.

---

## Layer 2 — Ownership & Render Isolation

The root component owns layout, providers, routing/surface selection, and truly
app-global signals. It does not own feature state just because that is the
easiest place to wire callbacks.

Place ownership where rerender impact should stop:

- Menu state belongs to the menu section/feature/row that displays it.
- Main-surface state belongs to the active surface or surface instance.
- Sidebars/panels that exist only for a surface belong under that surface.
- Form/input/draft/attachment/model-selection state belongs to the form or
  instance using it.
- Socket tokens, live status, stream buffers, request and interruption state
  belong to the live session model that owns them (Invariant 4).
- Modal form state belongs to the feature that opens and submits the modal. A
  shared modal layer may host DOM but must not own every workflow; carry a
  source instance key when a result must return to a specific instance.
- Parent ownership is justified only when the parent itself renders differently,
  or when multiple children must subscribe to the same app-level fact.

Reject these model-friendly but UI-hostile patterns:

- One root owns all state and passes it downward.
- One root creates most handlers and listeners.
- Children are mostly renderers with large prop bags.
- Feature folders exist, but real behavior still lives in the root.
- Sibling coordination via parent closures instead of narrow signals.
- Desktop/mobile variants instantiate duplicate controllers for one state.
- A refactor produces `useBigApp` / `AppRoot` / a root controller that only
  hides complexity.

### Communication

Prefer narrow intent signals over parent-owned callback meshes.

- Use commands like `openItem(id)`, `openDraft(id)`, `requestDelete(id)`,
  `openModal({ kind, sourceKey })`.
- Signals carry intent and IDs, not assembled JSX, large state objects, or
  feature internals.
- Receiving regions subscribe and decide how to update themselves.
- Cross-region coordination uses the model/external-store subscription, not root
  rerendering.

---

## Layer 3 — Refactor Criteria, Workflow, and Checks

A refactor is real only when ownership/source-of-truth changes.

**Acceptable:** model data leaves React state for a pure model; state/effects
move from root to the feature that uses them; buttons/forms call handlers owned
by their feature; cross-region coupling becomes a small signal/store API; root
imports region shells, not feature internals.

**Not acceptable:** moving a 1000-line root body into `useAppController`; moving
root JSX into `AppRoot` while keeping the same root-owned state; keeping
root-created handlers behind new wrappers; splitting files by visual area while
keeping one global render model; keeping immutable-state mirrors of the model.

### Workflow

1. Identify the source of truth. If feature data lives in React state, move it
   into a pure model + registry (Layer 1) before anything else.
2. Inspect the root for state, effects, refs, handlers, socket/API calls, modal
   state, and render helpers; classify each by the feature/instance that uses it.
3. Replace immutable-copy update paths with in-place mutation + `emit()`.
4. Bind components with `useModel(slice)` so each subscribes to exactly what it
   reads (Invariant 5).
5. Move feature handlers to the components that own the buttons/forms.
6. Replace parent callback chains with narrow signals where siblings coordinate.
7. Move feature-owned sidebars/panels/modals/subfeatures under their owner.
8. Ensure duplicate visual variants share one model, not duplicate controllers.
9. Delete root-level hooks/wrappers that only hid complexity; remove obsolete
   top-level folders after imports move.
10. Run lint/typecheck/build and verify key interactions after each shift.

### Render isolation checks

- Typing in a surface input does not rerender the menu.
- Expanding/collapsing menu rows does not rerender the main surface.
- Live/streaming events update only the affected surface/session instance.
- A connection-status change does not rerender the message list, and vice versa.
- Opening a modal does not reset unrelated surface or menu state.
- Navigating away and back restores the surface from the living model with no
  refetch/replay.
- Desktop/mobile variants do not create duplicate subscriptions/sockets/models.

Use the React DevTools Profiler when available. Temporary render counters are
allowed while diagnosing; remove them before finishing.

### Structural checks

- No model data is held in `useState`/`useReducer`/context value.
- Models and registry live in `packages/<service>_domain/src/front/model`.
- Root state is limited to layout, bootstrapping, providers, routing/surface
  selection, and app-level signals.
- Root has no feature-specific `handleX`, `renderX`, socket listener, submit
  handler, or modal form state.
- A top-level folder is an independent app region; if it exists only inside
  another region, it is nested under that owner.

### Review questions

- Where does this data's truth live — a pure model, or React state? If React
  state, that is the first thing to fix.
- Which component becomes meaningless if this state disappears? It probably
  owns it.
- Does this handler exist only so a parent can close over state for a child?
  Move it down or replace it with a signal.
- Will this update be visible outside one feature/instance? If not, keep it out
  of the root.
- Does this component subscribe to every slice it reads (no more, no less)?
- Is this split reducing source-of-truth/ownership coupling, or only line count?
