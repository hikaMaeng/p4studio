# Protocol (worked pair)

Wire shapes are a contract, not model state. Below is the correct/incorrect pair
the `Protocol` rule enforces. Both are drawn from a real service where one
channel got it right and another did not.

## Correct — one source, both sides depend, inbound is parsed

`packages/<svc>_domain/src/common/protocol/events/index.ts` — the only place the
shape exists, with a runtime guard beside the type:

```ts
export const LINKER_EVENTS = "linker-events-v1" as const;

export type LinkerEvent =
  | { protocol: typeof LINKER_EVENTS; type: "ready"; revision: number }
  | { protocol: typeof LINKER_EVENTS; type: "state_changed"; revision: number; reason: string };

export function parseLinkerEvent(v: unknown): LinkerEvent | null {
  // narrow `v` field by field; return null on any mismatch
}
```

Server builds the payload `satisfies` the wire type — an extra or renamed field
fails to compile here:

```ts
import { LINKER_EVENTS, type LinkerEvent } from "<svc>_domain/common/protocol/events";
socket.send(JSON.stringify({ protocol: LINKER_EVENTS, type: "ready", revision } satisfies LinkerEvent));
```

Client validates inbound with the guard, never casts:

```ts
import { parseLinkerEvent } from "<svc>_domain/common/protocol/events";
const event = parseLinkerEvent(JSON.parse(String(data)));   // not `as LinkerEvent`
if (event?.type === "state_changed") { /* … */ }
```

Change a field in the union and both the server `satisfies` and the client's use
of the parsed value stop compiling. The two cannot drift apart.

## Incorrect — envelope in the model, server assembles blind, client casts

`src/front/control-plane/model/types.ts` — the wire shape lives in the front
model:

```ts
export interface ControlPlaneSnapshot {   // ✗ a wire contract under src/front
  linker: LinkerInfo; nodes: NodesResponse; /* … */
}
```

Because it sits under `src/front`, the server (`src/server`) may not import it
(front↛server boundary), so the server re-assembles the same payload
independently across its routes. The client then casts:

```ts
const body = (await response.json()) as ControlPlaneSnapshot;   // ✗ unchecked
```

Rename a field server-side and nothing breaks at compile time; the mismatch
surfaces at runtime, in the browser, later.

## The fix

Move the envelope to `src/common/protocol/control-plane/`. Now the server can
import it and build `… satisfies ControlPlaneSnapshot`, the client uses
`parseControlPlaneSnapshot(…)`, and the front model imports the type instead of
re-declaring it. One edit to the type breaks every side that is wrong.

## Route binding

Keep the path and its types together in the protocol folder so neither side
hardcodes the other's contract:

```ts
// common/protocol/control-plane/routes.ts
export const nodesRoute = {
  path: "/api/nodes", method: "GET",
} as const;
export type NodesResponse = { /* … */ };
```

The server registers its handler against `nodesRoute`; the client calls
`request(nodesRoute)`. A path or shape change is one edit both sides read.

## Reject

- `request<{…}>` on the client or `res.json({…})` object literals on the server — inline anonymous wire shapes.
- `as <Wire>` on a fetched body; use a `parse<Wire>()` guard instead.
- `*Snapshot` / `*Response` / `*Request` / `*Event` types declared under `src/front` or `src/server`.
- `common/protocol/**` importing from `src/front`, `src/server`, or a feature model.
