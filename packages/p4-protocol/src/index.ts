/** Public protocol identities mirrored from the P4 wire contract. */
export const P4_PROTOCOL = Object.freeze({
  frameVersion: 8,
  eventVersion: 3,
  statusSchemaVersion: 6,
});

/** Operations exposed by the P4 agent boundary and understood by Studio. */
export const P4_AGENT_OPERATIONS = Object.freeze([
  "create-node",
  "delete-node",
  "inspect-machine",
  "inspect-model",
  "status",
  "cancel",
] as const);

export type P4AgentOperation = (typeof P4_AGENT_OPERATIONS)[number];

/** Reachability deliberately does not claim protocol-level health. */
export type AgentReachability = "unknown" | "reachable" | "unreachable";

export {
  MAX_P4_AGENT_SNAPSHOT_BYTES,
  P4_AGENT_INSPECTION_SCHEMA_VERSION,
  P4_AGENT_INSPECT_CONTENT_TYPE,
  P4_AGENT_SNAPSHOT_CONTENT_TYPE,
  P4_EVENT_VERSION,
  P4_RESULT_CONTENT_TYPE,
  decodeAgentInspectionResponse,
  encodeAgentInspectionRequest,
} from "./event/agent-inspection.js";

export type {
  AgentInspectionRequest,
  P4AgentSnapshot,
  P4MachineSnapshot,
  P4RegisteredNodeSnapshot,
} from "./event/agent-inspection.js";
