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
  private readonly errors = new Set<(error: Error) => void>();
  private dispatchAgentId: string | undefined;
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
      const current = connection;
      connection.onEvent((event, receivedAtMs) => {
        if (this.connections.get(reception.agentId) === current) this.listeners.forEach(listener => listener(event, receivedAtMs));
      });
      connection.onError(error => {
        if (this.connections.get(reception.agentId) !== current) return;
        this.connections.delete(reception.agentId);
        // A retired preparation socket owns no inference return route. A live
        // exchange still rejects its own wait; never replay that command.
        if (this.dispatchAgentId === undefined || this.dispatchAgentId === reception.agentId) this.errors.forEach(listener => listener(error));
      });
    }
    return connection.exchange(...args);
  }
  dispatch(...args: Parameters<BrowserP4Connection["dispatch"]>) {
    const reception = this.reception(args[0]);
    const connection = this.connections.get(reception.agentId);
    if (this.closed || !connection) throw new Error("Prepare the target session before inference");
    return connection.dispatch(...args);
  }
  dispatchIdentity(target: P4Endpoint) {
    const reception = this.reception(target), connection = this.connections.get(reception.agentId);
    if (this.closed || !connection) throw new Error("Prepare the target session before reading its OUTER identity");
    return { outer: connection.outer, nextSequence: connection.nextSequence };
  }
  /** After SESSION_READY on every stage, retain the PREFILL/OUTPUT/RELEASE route only. */
  async retainDispatchConnection(target: P4Endpoint) {
    const reception = this.reception(target);
    if (this.closed || !this.connections.has(reception.agentId)) throw new Error("Prepare the target session before inference");
    this.dispatchAgentId = reception.agentId;
    const retired: BrowserP4Connection[] = [];
    for (const [agentId, connection] of this.connections) {
      if (agentId === reception.agentId) continue;
      this.connections.delete(agentId); retired.push(connection);
    }
    // FINISH/ACK releases sockets only, never SESSION or request ownership.
    await Promise.all(retired.map(connection => connection.close()));
  }
  owns(target: P4Endpoint) { return [...this.connections.values()].some(connection => sameEndpoint(target, connection.outer)); }
  onEvent(listener: (event: P4Event, receivedAtMs: number) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  recover() { this.connections.forEach(connection => connection.close()); this.connections.clear(); }
  onError(listener: (error: Error) => void) { this.errors.add(listener); return () => this.errors.delete(listener); }
  async close() {
    this.closed = true;
    const connections = [...this.connections.values()]; this.connections.clear(); this.listeners.clear(); this.errors.clear();
    return (await Promise.all(connections.map(connection => connection.close()))).every(Boolean);
  }
}
