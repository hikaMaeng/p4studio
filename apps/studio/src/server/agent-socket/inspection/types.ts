import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import type { AgentRecord, AgentProtocolObservation } from "../../../common/domain.js";

export type ProbeResult = Pick<
  AgentRecord,
  "reachability" | "latencyMs" | "probeError"
>;

export type AgentInspectionAttempt = {
  probe: ProbeResult;
  observation: AgentProtocolObservation;
};

export type AgentInspector = (
  host: string,
  port: number,
  timeoutMs: number,
) => Promise<AgentInspectionAttempt>;

export const availableObservation = (
  snapshot: P4AgentSnapshot,
): AgentProtocolObservation => ({
  state: "available",
  inspectedAt: new Date().toISOString(),
  error: null,
  snapshot,
});

export const errorObservation = (message: string): AgentProtocolObservation => ({
  state: "error",
  inspectedAt: new Date().toISOString(),
  error: message,
  snapshot: null,
});
