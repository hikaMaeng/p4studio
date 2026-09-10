// Target: packages/<service>_domain/src/front/model/SessionModel.ts
//
// Example domain model. Pure in-memory state plus owned resources (a socket).
// A class is justified here per the repo code-style rule: stable identity (one
// per session id), mutable lifecycle, and resource ownership. Submodels are
// plain properties, each its own Emitter so its changes route independently.

import { Emitter } from "./Emitter.js";

export interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
}

/** Submodel: own trigger, so connection blips do not re-render the message list. */
export class ConnectionModel extends Emitter {
  status: "idle" | "connecting" | "open" | "closed" = "idle";

  setStatus(next: ConnectionModel["status"]): void {
    if (this.status === next) return;
    this.status = next;
    this.emit();
  }
}

export class SessionModel extends Emitter {
  readonly connection = new ConnectionModel();
  messages: Message[] = [];
  #socket?: WebSocket;

  constructor(readonly id: string) {
    super();
  }

  connect(url: string): void {
    this.connection.setStatus("connecting");
    const socket = new WebSocket(url);
    this.#socket = socket;
    socket.onopen = () => this.connection.setStatus("open");
    socket.onclose = () => this.connection.setStatus("closed");
    socket.onmessage = (event) => this.#onData(JSON.parse(event.data) as Message);
  }

  // Mutate in place. No immutable copy. emit() is the sole render trigger.
  #onData(msg: Message): void {
    this.messages.push(msg);
    this.emit();
  }

  /** Called by the registry only when the DOMAIN ends the session, never on unmount. */
  dispose(): void {
    this.#socket?.close();
    this.#socket = undefined;
  }
}
