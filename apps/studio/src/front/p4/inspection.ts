import { decodeAgentInspectionResponse, encodeP4Event, P4_AGENT_INSPECT_CONTENT_TYPE, P4_AGENT_SNAPSHOT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE } from "@p4studio/p4-protocol";
import { agentAddress, type GraphAgent, type GraphAgentList } from "@p4studio/studio_domain/common";
import { BrowserP4Reception, readAgentTopology } from "./reception.js";

/** P4 agent inspection is an adapter-neutral, browser-owned control exchange. */
export async function inspectGraphAgent(agent: GraphAgent, topology?: GraphAgentList) {
  const current = topology ?? await readAgentTopology();
  const target = current.agents.find(value => value.id === agent.id);
  if (!target) throw new Error("Target agent is no longer registered");
  const address = agentAddress(target);
  const connection = new BrowserP4Reception(current);
  try {
    const response = await connection.exchange({ kind: "agent", address }, null, P4_AGENT_INSPECT_CONTENT_TYPE, {}, [P4_AGENT_SNAPSHOT_CONTENT_TYPE, P4_RESULT_CONTENT_TYPE], 10_000);
    return decodeAgentInspectionResponse(encodeP4Event(response), connection.operationId);
  } finally { connection.close(); }
}
