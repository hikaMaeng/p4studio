import { decodeAgentInspectionResponse, encodeP4Event, P4_AGENT_INSPECT_CONTENT_TYPE, P4_AGENT_SNAPSHOT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE } from "@p4studio/p4-protocol";
import type { GraphAgent } from "@p4studio/studio_domain/common";
import { BrowserP4Connection } from "./connection.js";

/** P4 agent inspection is an adapter-neutral, browser-owned control exchange. */
export async function inspectGraphAgent(agent: GraphAgent) {
  const address = `tcp://${agent.host.includes(":") ? `[${agent.host}]` : agent.host}:${agent.port}`;
  const connection = await BrowserP4Connection.open(agent.id, address);
  try {
    const response = await connection.exchange({ kind: "agent", address }, null, P4_AGENT_INSPECT_CONTENT_TYPE, {}, [P4_AGENT_SNAPSHOT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE], 10_000);
    return decodeAgentInspectionResponse(encodeP4Event(response), connection.operationId);
  } finally { connection.close(); }
}
