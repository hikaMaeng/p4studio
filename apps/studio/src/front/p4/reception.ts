import { sameEndpoint, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import { agentAddress, graphAgentListSchema, graphInventoryRoutes, resolveAgentReception, type GraphAgentList } from "@p4studio/studio_domain/common";
import { BrowserP4Connection } from "./connection.js";

export async function readAgentTopology(): Promise<GraphAgentList> {
  const response = await fetch(graphInventoryRoutes.agents.path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return graphAgentListSchema.parse(await response.json());
}

/** Frozen topology per operation. Each target keeps its endpoint; only reception changes. */
export class BrowserP4Reception {
  readonly operationId = crypto.randomUUID();
  private readonly connections = new Map<string, BrowserP4Connection>();
  private readonly listeners = new Set<(event: P4Event, receivedAtMs: number) => void>();
  private closed = false;
  constructor(private readonly topology: GraphAgentList, private readonly addresses: Map<string, string> = new Map(topology.agents.map(agent => [agent.id, agentAddress(agent)]))) {
    this.topology = structuredClone(topology); this.addresses = new Map(addresses);
  }

  private reception(target: P4Endpoint) {
    if (target.kind === "outer") throw new Error("OUTER is not a managed request target");
    const targetId = [...this.addresses].find(([, address]) => address === target.address)?.[0];
    if (!targetId) throw new Error("Request target has no registered agent identity");
    return resolveAgentReception(targetId, this.topology.agents, this.topology.groups);
  }
  async exchange(...args: Parameters<BrowserP4Connection["exchange"]>) {
    if (this.closed) throw new Error("P4 operation is closed");
    const reception = this.reception(args[0]);
    let connection = this.connections.get(reception.agentId);
    if (!connection) {
      connection = await BrowserP4Connection.open(reception.agentId, reception.address, this.operationId);
      if (this.closed) { connection.close(); throw new Error("P4 operation was closed while connecting"); }
      this.connections.set(reception.agentId, connection);
      connection.onEvent((event, receivedAtMs) => this.listeners.forEach(listener => listener(event, receivedAtMs)));
    }
    return connection.exchange(...args);
  }
  dispatch(...args: Parameters<BrowserP4Connection["dispatch"]>) {
    const reception = this.reception(args[0]);
    const connection = this.connections.get(reception.agentId);
    if (this.closed || !connection) throw new Error("Prepare the target session before inference");
    return connection.dispatch(...args);
  }
  owns(target: P4Endpoint) { return [...this.connections.values()].some(connection => sameEndpoint(target, connection.outer)); }
  onEvent(listener: (event: P4Event, receivedAtMs: number) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  recover() { this.connections.forEach(connection => connection.close()); this.connections.clear(); }
  close() { this.closed = true; this.connections.forEach(connection => connection.close()); this.connections.clear(); this.listeners.clear(); }
}
