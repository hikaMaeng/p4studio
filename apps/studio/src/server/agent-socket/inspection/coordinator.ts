import type { AgentRecord, AgentViewRecord } from "../../../common/domain.js";
import type { StudioDatabase } from "../../database/client.js";
import type { AgentInspector } from "./types.js";
import { errorObservation } from "./types.js";
import type { AgentObservationStore } from "./store.js";

/** Applies one inspection result to durable reachability and transient P4 state. */
export const inspectRegisteredAgent = async (
  database: StudioDatabase,
  observations: AgentObservationStore,
  inspector: AgentInspector,
  agent: AgentRecord,
  timeoutMs: number,
): Promise<AgentViewRecord> => {
  observations.begin(agent.id);
  let attempt;
  try {
    attempt = await inspector(agent.host, agent.port, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "P4 inspection failed";
    attempt = {
      probe: { reachability: "unreachable" as const, latencyMs: null, probeError: message },
      observation: errorObservation(message),
    };
  }
  const updated = database.updateProbe(agent.id, attempt.probe);
  observations.set(agent.id, attempt.observation);
  return observations.view(updated);
};
