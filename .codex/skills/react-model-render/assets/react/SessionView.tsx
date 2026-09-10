// Target: apps/<service>/src/front/session/SessionView.tsx
//
// Each component subscribes to exactly the slice it reads, so updates stop at
// the smallest correct subtree. No feature state in the root, no prop bags of
// state, no handlers closed over by a parent. Markup exposes role / aria-label /
// data-testid for headless-browser verification (see the headless-browser-test skill).

import { getSession } from "<service>_domain/front/model/registry";
import { useModel } from "../lib/useModel";

export function SessionView({ id }: { id: string }) {
  // The model is fetched by id and lives outside React; nothing is drilled in.
  return (
    <section aria-label="session" data-testid="session">
      <ConnectionBadge id={id} />
      <MessageList id={id} />
    </section>
  );
}

// Reads only the connection submodel -> re-renders ONLY on status changes.
function ConnectionBadge({ id }: { id: string }) {
  const conn = useModel(getSession(id).connection);
  return <span role="status">{conn.status}</span>;
}

// Reads messages -> re-renders on new messages, not on connection blips.
function MessageList({ id }: { id: string }) {
  const session = useModel(getSession(id));
  return (
    <ul aria-label="messages">
      {session.messages.map((m) => (
        <li key={m.id} data-role={m.role}>
          {m.text}
        </li>
      ))}
    </ul>
  );
}
