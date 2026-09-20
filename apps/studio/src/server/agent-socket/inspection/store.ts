import type {
  AgentProtocolObservation,
  AgentRecord,
  AgentViewRecord,
} from "../../../common/domain.js";

const pendingObservation = (): AgentProtocolObservation => ({
  state: "pending",
  inspectedAt: null,
  error: null,
  snapshot: null,
});

/** Owns transient P4 observations separately from durable Studio registrations. */
export class AgentObservationStore {
  private readonly observations = new Map<string, AgentProtocolObservation>();

  begin(agentId: string): void {
    this.observations.set(agentId, pendingObservation());
  }

  set(agentId: string, observation: AgentProtocolObservation): void {
    this.observations.set(agentId, observation);
  }

  delete(agentId: string): void {
    this.observations.delete(agentId);
  }

  view(agent: AgentRecord, persisted: AgentProtocolObservation | null = null): AgentViewRecord {
    return {
      ...agent,
      inspection: this.observations.get(agent.id) ?? persisted ?? pendingObservation(),
    };
  }
}
