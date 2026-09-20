import { afterEach, expect, it, vi } from "vitest";
import { decodeLifecycleMetadata, parseLifecycleRequest, encodeLifecycleMetadata, NODE_LOAD_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, decodeP4Event, encodeP4Event, frameP4Event, P4_AGENT_INSPECT_CONTENT_TYPE, P4_AGENT_SNAPSHOT_CONTENT_TYPE, type P4Event } from "@p4studio/p4-protocol";
import { BrowserP4Reception } from "./reception.js";
import { inspectGraphAgent } from "./inspection.js";
import { deploymentSchema, runBrowserDeployment } from "@p4studio/studio_domain/common";
import { deployments, emptyDeployment, emptyStage, type DeploymentGateway } from "@p4studio/studio_domain/front";
import { startModels } from "../features/models/api.js";

class Socket extends EventTarget {
  static OPEN = 1;
  static opened: string[] = [];
  static events: P4Event[] = [];
  static unavailable = new Set<string>();
  readyState = 1;
  constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
  send(value: unknown) {
    if (typeof value === "string") {
      const control = JSON.parse(value);
      if (control.type === "open") {
        Socket.opened.push(control.agentId);
        queueMicrotask(() => this.message(JSON.stringify(Socket.unavailable.has(control.agentId)
          ? { type: "error", connectionId: control.connectionId, detail: "Gateway unavailable" }
          : { ...control, type: "opened" })));
      }
      return;
    }
    const event = decodeP4Event(new Uint8Array(value as ArrayBuffer).slice(4));
    Socket.events.push(event);
    const reply: P4Event = { ...event, eventId: crypto.randomUUID(), causationId: event.eventId, source: event.target, target: event.source, contentType: event.contentType === "load" ? "loaded" : event.contentType === "unload" ? "unloaded" : "done", adapterKind: event.target.kind === "agent" ? null : event.adapterKind };
    if ([NODE_LOAD_CONTENT_TYPE, NODE_UNLOAD_CONTENT_TYPE].includes(event.contentType)) {
      const operation = event.contentType === NODE_LOAD_CONTENT_TYPE ? "load" : "unload";
      const decoded = decodeLifecycleMetadata(event.payload), metadata = parseLifecycleRequest(decoded.metadata, operation);
      const command = JSON.parse(new TextDecoder().decode(decoded.opaque));
      reply.contentType = NODE_LIFECYCLE_RESULT_CONTENT_TYPE;
      reply.payload = encodeLifecycleMetadata({ schema: 1, node_id: metadata.node_id, node_generation: metadata.node_generation,
        adapter_kind: metadata.adapter_kind, adapter_content_type: operation === "load" ? "loaded" : "unloaded",
        operation, status: "succeeded", resource_state: operation === "load" ? "present" : "absent" },
        new TextEncoder().encode(JSON.stringify({ load_generation: command.load_generation })));
    }
    if (event.contentType === P4_AGENT_INSPECT_CONTENT_TYPE) {
      reply.contentType = P4_AGENT_SNAPSHOT_CONTENT_TYPE;
      reply.payload = new TextEncoder().encode(JSON.stringify({
        schema: 1, protocol_version: 3, generated_at_unix_ms: Date.now(),
        machine: {
          capability: { os: "linux", arch: "x86_64", cpu: { physical_cores: 1, logical_cores: 2 }, memory: { total_bytes: 1024 }, gpus: [], adapters: ["llamacpp"] },
          occupancy: { memory: { available_bytes: 512, used_bytes: 512 }, gpus: [] },
          probes: { memory: { source: "os", state: "available", detail: null }, gpus: { source: "none", state: "unavailable", detail: "fixture" } },
        },
        nodes: [{ node_id: "worker-node", generation: 7, adapter_kind: "llamacpp", state: { lifecycle: "ready" } }],
      }));
    }
    queueMicrotask(() => this.message(frameP4Event(encodeP4Event(reply)).buffer));
  }
  message(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
  close() {}
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Socket.opened = []; Socket.events = []; Socket.unavailable.clear(); });

it("sends control and inference via per-group receptions with real target and return identities", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const topology = {
    agents: ["a", "b", "c", "d", "e"].map(id => ({ id: `00000000-0000-4000-8000-00000000000${id}`, name: id, host: id, port: 52211 })),
    groups: [
      { id: "one", name: "one", gatewayAgentId: "a", memberAgentIds: ["a", "b"] },
      { id: "two", name: "two", gatewayAgentId: "c", memberAgentIds: ["c", "d"] },
    ],
  };
  for (const group of topology.groups) {
    group.gatewayAgentId = topology.agents.find(agent => agent.name === group.gatewayAgentId)!.id;
    group.memberAgentIds = group.memberAgentIds.map(id => topology.agents.find(agent => agent.name === id)!.id);
  }
  const wire = new BrowserP4Reception(topology);
  // Editing the shared registry cannot redirect this already-created operation.
  topology.groups[0]!.gatewayAgentId = topology.agents[1]!.id;
  try {
    const received: P4Event[] = []; wire.onEvent(event => received.push(event));
    for (const id of ["b", "d", "e", "b"]) {
      const reply = await wire.exchange({ kind: "node", address: `tcp://${id}:52211`, nodeId: "n", generation: 1 }, "llamacpp", "session", {}, ["done"], 1000);
      expect(wire.owns(reply.target)).toBe(true);
    }
    wire.dispatch({ kind: "node", address: "tcp://b:52211", nodeId: "n", generation: 1 }, "llamacpp", "prefill", {});
    expect(Socket.opened).toEqual([0, 2, 4].map(index => topology.agents[index]!.id));
    expect(Socket.events.map(event => event.target.address)).toEqual(["tcp://b:52211", "tcp://d:52211", "tcp://e:52211", "tcp://b:52211", "tcp://b:52211"]);
    expect(Socket.events.map(event => event.returnRoute?.address)).toEqual(["tcp://a:52211", "tcp://c:52211", "tcp://e:52211", "tcp://a:52211", "tcp://a:52211"]);
    expect(Socket.events.every(event => JSON.stringify(event.source) === JSON.stringify(event.returnRoute))).toBe(true);
    expect(Socket.events.every(event => event.correlationId === wire.operationId)).toBe(true);
    expect(received.length).toBeGreaterThanOrEqual(4);
  } finally { wire.close(); }
});

it("loads and unloads stages through distinct gateway groups without a model ingress choice", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agents = ["gateway-a", "worker-b", "gateway-c", "worker-d"].map(host => ({ id: crypto.randomUUID(), name: host, host, port: 52211 }));
  const topology = { agents, groups: [0, 2].map(index => ({ id: String(index), name: String(index), gatewayAgentId: agents[index]!.id, memberAgentIds: [agents[index]!.id, agents[index + 1]!.id] })) };
  const addresses = new Map(agents.map(agent => [agent.id, `tcp://${agent.host}:52211`]));
  const record = deploymentSchema.parse({
    ...emptyDeployment(), id: "deployment", name: "distributed", adapter: "custom", ingressAgentId: "", totalLayers: 2,
    loadContentType: "load", loadedContentType: "loaded", unloadContentType: "unload", unloadedContentType: "unloaded", errorContentType: "error",
    stages: [1, 3].map((index, order) => ({ ...emptyStage(), id: String(index), nodeId: "node", agentId: agents[index]!.id, layerStart: order, layerEnd: order + 1, customPayload: "{}" })),
    status: "loading", loadGeneration: 10, operationId: "operation", error: "", reports: [], resolvedAddresses: {}, createdAt: "now", updatedAt: "now",
  });
  await runBrowserDeployment(record, "load", addresses, new BrowserP4Reception(topology, addresses), async () => {});
  expect(record.status).toBe("ready");
  expect(record.reports.map(report => report.state)).toEqual(["ready", "ready"]);
  await runBrowserDeployment(record, "unload", addresses, new BrowserP4Reception(topology, addresses), async () => {});
  expect(record.status).toBe("unloaded");
  expect(Socket.opened).toEqual([0, 2, 2, 0].map(index => agents[index]!.id));
  expect(Socket.events.every(event => event.target.kind === "agent")).toBe(true);
  expect(Socket.events.map(event => [event.contentType, event.target.address])).toEqual([
    [NODE_LOAD_CONTENT_TYPE, "tcp://worker-b:52211"], [NODE_LOAD_CONTENT_TYPE, "tcp://worker-d:52211"],
    [NODE_UNLOAD_CONTENT_TYPE, "tcp://worker-d:52211"], [NODE_UNLOAD_CONTENT_TYPE, "tcp://worker-b:52211"],
  ]);
});

it("uses the current gateway for every agent and model inventory inspection after group edits", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agents = ["gateway-a", "worker", "gateway-b"].map(host => ({ id: crypto.randomUUID(), name: host, host, port: 52211 }));
  const worker = agents[1]!;
  const group = { id: "group", name: "group", gatewayAgentId: agents[0]!.id, memberAgentIds: agents.map(agent => agent.id) };
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ agents, groups: [group] })));
  vi.stubGlobal("fetch", fetch);
  const first = await inspectGraphAgent(worker);
  expect(first.nodes[0]).toMatchObject({ nodeId: "worker-node", generation: 7 });
  group.gatewayAgentId = agents[2]!.id;
  await inspectGraphAgent(worker);
  group.memberAgentIds = [agents[2]!.id];
  await inspectGraphAgent(worker);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch).toHaveBeenCalledWith("/api/graph-agents", { cache: "no-store" });
  expect(Socket.opened).toEqual([agents[0]!.id, agents[2]!.id, worker.id]);
  expect(Socket.events.map(event => event.target)).toEqual(Array(3).fill({ kind: "agent", address: "tcp://worker:52211" }));
  expect(Socket.events.map(event => event.returnRoute?.address)).toEqual(["tcp://gateway-a:52211", "tcp://gateway-b:52211", "tcp://worker:52211"]);
});

it("does not dial the worker when its gateway fails", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agents = ["gateway", "worker"].map(host => ({ id: crypto.randomUUID(), name: host, host, port: 52211 }));
  const topology = { agents, groups: [{ id: "group", name: "group", gatewayAgentId: agents[0]!.id, memberAgentIds: agents.map(agent => agent.id) }] };
  Socket.unavailable.add(agents[0]!.id);
  await expect(inspectGraphAgent(agents[1]!, topology)).rejects.toThrow("Gateway unavailable");
  expect(Socket.opened).toEqual([agents[0]!.id]);
  expect(Socket.events).toEqual([]);
});

it("refuses inspection when the topology response omits gateway groups", async () => {
  const worker = { id: crypto.randomUUID(), name: "worker", host: "worker", port: 52211 };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ agents: [worker] }))));
  await expect(inspectGraphAgent(worker)).rejects.toThrow();
  expect(Socket.opened).toEqual([]);
});

it("refreshes model state through the latest cluster gateway and never falls back to its workers", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agents = ["gateway-old", "worker-a", "worker-b", "gateway-current"].map(host => ({ id: crypto.randomUUID(), name: host, host, port: 52211 }));
  const group = { id: "cluster", name: "cluster", gatewayAgentId: agents[3]!.id, memberAgentIds: agents.map(agent => agent.id) };
  const record = deploymentSchema.parse({
    ...emptyDeployment(), id: "model", name: "cluster model", ingressAgentId: agents[0]!.id,
    stages: [1, 2].map(index => ({ ...emptyStage(), id: String(index), agentId: agents[index]!.id, nodeId: "worker-node", nodeGeneration: 7 })),
    status: "unknown", loadGeneration: 42, operationId: "original-load", error: "", reports: [],
    resolvedAddresses: Object.fromEntries(agents.map(agent => [agent.id, `tcp://${agent.host}:52211`])), createdAt: "created", updatedAt: "revision",
  });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    requests.push(path);
    if (path === "/api/graph-agents") return new Response(JSON.stringify({ agents, groups: [group] }));
    if (path.endsWith("/reconcile")) return new Response(JSON.stringify({ ...record, ...JSON.parse(String(init?.body)) }));
    return new Response(JSON.stringify({ deployments: [record] }));
  }));
  let gateway!: DeploymentGateway;
  vi.spyOn(deployments, "start").mockImplementation(value => { gateway = value; });
  startModels();
  const refreshed = await gateway.reconcile(record.id);
  expect(Socket.opened).toEqual([agents[3]!.id, agents[3]!.id]);
  expect(Socket.events.map(event => event.target.address)).toEqual(["tcp://worker-a:52211", "tcp://worker-b:52211"]);
  expect(Socket.events.every(event => event.contentType === P4_AGENT_INSPECT_CONTENT_TYPE && event.returnRoute?.address === "tcp://gateway-current:52211")).toBe(true);
  expect(refreshed.operationId).toBe("original-load");
  expect(requests.filter(path => path === "/api/graph-agents")).toHaveLength(1);

  Socket.opened = []; Socket.events = [];
  group.gatewayAgentId = agents[0]!.id;
  Socket.unavailable.add(agents[0]!.id);
  const failed = await gateway.reconcile(record.id);
  expect(Socket.opened).toEqual([agents[0]!.id, agents[0]!.id]);
  expect(Socket.events).toEqual([]);
  expect(failed.status).toBe("unknown");
  expect(failed.reports.every(report => report.observation?.detail === "Gateway unavailable")).toBe(true);
});
