// Target: packages/<service>_domain/src/front/model/registry.ts
//
// Models live OUTSIDE the React tree, keyed by domain id, so their lifecycle is
// independent of component mount/unmount. Navigating away unmounts components
// but keeps the model (and its socket) alive; navigating back reads the still-
// living model and the UI restores instantly with no replay logic.

import { SessionModel } from "./SessionModel.js";

const sessions = new Map<string, SessionModel>();

export function getSession(id: string): SessionModel {
  let model = sessions.get(id);
  if (!model) {
    model = new SessionModel(id);
    sessions.set(id, model);
  }
  return model;
}

/** Dispose only when the DOMAIN declares the session over — never from a component. */
export function disposeSession(id: string): void {
  sessions.get(id)?.dispose();
  sessions.delete(id);
}
