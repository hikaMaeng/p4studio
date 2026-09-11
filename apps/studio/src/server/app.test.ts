import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { createApp } from "./app.js";
import { StudioDatabase } from "./database/client.js";
import { AgentObservationStore } from "./agent-socket/inspection/store.js";
import type { AgentInspector } from "./agent-socket/inspection/types.js";
import { refreshAgentObservations } from "./agent-socket/monitor.js";

const databases: StudioDatabase[] = [];
const temporaryDirectories: string[] = [];
const failedInspector: AgentInspector = async () => ({
  probe: { reachability: "unreachable", latencyMs: null, probeError: "test endpoint offline" },
  observation: { state: "error", inspectedAt: "2026-09-10T00:00:00.000Z", error: "test endpoint offline", snapshot: null },
});

const availableInspector: AgentInspector = async () => ({
  probe: { reachability: "reachable", latencyMs: 3, probeError: null },
  observation: {
    state: "available",
    inspectedAt: "2026-09-10T00:00:00.000Z",
    error: null,
    snapshot: {
      schema: 1,
      protocolVersion: 3,
      generatedAtUnixMs: 1_789_000_000_000,
      machine: {
        capability: { os: "windows", arch: "x86_64", cpu: { physicalCores: 8, logicalCores: 16 }, memory: { totalBytes: 32_000 }, gpus: [], adapters: ["llamacpp"] },
        occupancy: { memory: { availableBytes: 16_000, usedBytes: 16_000 }, gpus: [] },
        probes: { memory: { source: "os", state: "available", detail: null }, gpus: { source: "nvidia-smi", state: "available", detail: null } },
      },
      nodes: [{ nodeId: "live-node", generation: 2, adapterKind: "llamacpp", state: { lifecycle: "ready" } }],
    },
  },
});

const setup = (inspector: AgentInspector = failedInspector) => {
  const database = new StudioDatabase(":memory:");
  databases.push(database);
  const observations = new AgentObservationStore();
  void inspector;
  return { database, observations, app: createApp(database, observations) };
};

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe("Studio integration API", () => {
  it("persists an agent and returns the audited protocol boundary", async () => {
    const { app } = setup();
    const created = await request(app).post("/api/agents").send({ name: "test-agent", host: "127.0.0.1", port: 59998 }).expect(201);
    expect(created.body).not.toHaveProperty("adapter");
    expect(created.body.inspection).toMatchObject({ state: "pending", error: null });
    const snapshot = await request(app).get("/api/snapshot").expect(200);
    expect(snapshot.body.agents).toHaveLength(1);
    expect(snapshot.body.protocol).toEqual({ frameVersion: 8, eventVersion: 3, statusSchemaVersion: 6 });
  });

  it("does not start a P4 inspection while registering an agent", async () => {
    const { app } = setup(availableInspector);
    const created = await request(app).post("/api/agents").send({ name: "local-agent", host: "192.168.0.6", port: 51055 }).expect(201);
    expect(created.body).toMatchObject({ reachability: "unknown", inspection: { state: "pending", snapshot: null } });
  });

  it("edits the SQLite-owned agent registration without opening a P4 connection", async () => {
    const calls: Array<{ host: string; port: number }> = [];
    const inspector: AgentInspector = async (host, port) => {
      calls.push({ host, port });
      return availableInspector(host, port, 100);
    };
    const { app, database } = setup(inspector);
    const created = await request(app).post("/api/agents").send({ name: "before", host: "127.0.0.1", port: 59993 }).expect(201);
    const updated = await request(app).patch(`/api/agents/${created.body.id}`).send({ name: "managed-agent", host: "192.168.0.42", port: 51055 }).expect(200);
    expect(updated.body).toMatchObject({ name: "managed-agent", host: "192.168.0.42", port: 51055, inspection: { state: "pending" } });
    expect(database.agent(created.body.id)).toMatchObject({ name: "managed-agent", host: "192.168.0.42", port: 51055 });
    expect(calls).toEqual([]);
  });

  it("rejects an agent registration edit that conflicts with another SQLite record", async () => {
    const { app, database } = setup();
    const first = database.createAgent({ name: "first", host: "127.0.0.1", port: 59992 });
    database.createAgent({ name: "second", host: "127.0.0.1", port: 59991 });
    await request(app).patch(`/api/agents/${first.id}`).send({ name: "second", host: "127.0.0.1", port: 59992 }).expect(409);
    expect(database.agent(first.id)?.name).toBe("first");
  });

  it("bounds concurrent inspection when many agents are registered", async () => {
    const { database, observations } = setup();
    for (let index = 0; index < 7; index += 1) {
      database.createAgent({ name: `agent-${index}`, host: "127.0.0.1", port: 52000 + index });
    }
    let active = 0;
    let maximumActive = 0;
    const inspector: AgentInspector = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return availableInspector("127.0.0.1", 0, 100);
    };
    await refreshAgentObservations(database, observations, inspector, 100, 2);
    expect(maximumActive).toBe(2);
    expect(database.agents().every((agent) => agent.reachability === "reachable")).toBe(true);
  });

  it("keeps pipeline stages ordered and enforces relationships", async () => {
    const { app, database } = setup();
    const agent = database.createAgent({ name: "a", host: "127.0.0.1", port: 59997 });
    const model = database.createModel({ name: "m", artifact: "model.gguf", architecture: "mock", adapter: "mock", contextLength: null, notes: "" });
    const second = database.createNode({ agentId: agent.id, name: "second" });
    const first = database.createNode({ agentId: agent.id, name: "first" });
    const response = await request(app).post("/api/pipelines").send({ name: "p", modelId: model.id, stages: [
      { nodeId: second.id, stageIndex: 1, layerStart: 8, layerEnd: 16, launchArgs: "{}" },
      { nodeId: first.id, stageIndex: 0, layerStart: 0, layerEnd: 8, launchArgs: "{}" },
    ] }).expect(201);
    expect(response.body.stages.map((stage: { stageIndex: number }) => stage.stageIndex)).toEqual([0, 1]);
  });

  it("stores a Studio node declaration without an adapter or P4 node claim", async () => {
    const { app, database } = setup();
    const agent = database.createAgent({ name: "a", host: "127.0.0.1", port: 59990 });
    const response = await request(app).post(`/api/agents/${agent.id}/nodes`).send({ name: "planned-node" }).expect(201);
    expect(response.body).toMatchObject({ agentId: agent.id, name: "planned-node", lifecycle: "declared" });
    expect(response.body).not.toHaveProperty("adapter");
    expect(database.nodes()).toEqual([expect.objectContaining({ id: response.body.id, name: "planned-node" })]);
  });

  it("rejects duplicate agent endpoints", async () => {
    const { app } = setup();
    const body = { name: "one", host: "127.0.0.1", port: 59996 };
    await request(app).post("/api/agents").send(body).expect(201);
    await request(app).post("/api/agents").send({ ...body, name: "two" }).expect(409);
  });

  it("removes the legacy agent adapter without losing registrations", () => {
    const directory = mkdtempSync(join(tmpdir(), "p4studio-agent-migration-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "legacy.db");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        adapter TEXT NOT NULL,
        reachability TEXT NOT NULL DEFAULT 'unknown',
        latency_ms INTEGER,
        last_probe_at TEXT,
        probe_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(host, port)
      );
      INSERT INTO agents (id,name,host,port,adapter,created_at,updated_at)
      VALUES ('legacy-agent','legacy','127.0.0.1',59995,'llamacpp','2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z');
    `);
    legacy.close();

    const database = new StudioDatabase(path);
    databases.push(database);
    expect(database.agents()).toEqual([expect.objectContaining({ id: "legacy-agent", name: "legacy" })]);
    expect(database.agents()[0]).not.toHaveProperty("adapter");
    const columns = database.connection.prepare("SELECT name FROM pragma_table_info('agents')").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("adapter");
    expect(database.createAgent({ name: "new", host: "127.0.0.1", port: 59994 })).toMatchObject({ name: "new" });
  });

  it("removes the legacy Studio-node adapter without treating it as P4 state", () => {
    const directory = mkdtempSync(join(tmpdir(), "p4studio-node-migration-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "legacy.db");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, host TEXT NOT NULL, port INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(host, port));
      CREATE TABLE nodes (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, name TEXT NOT NULL, adapter TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'declared', created_at TEXT NOT NULL, UNIQUE(agent_id, name));
      INSERT INTO agents (id,name,host,port,created_at,updated_at) VALUES ('legacy-agent','legacy','127.0.0.1',59989,'2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z');
      INSERT INTO nodes (id,agent_id,name,adapter,created_at) VALUES ('legacy-node','legacy-agent','planned','llamacpp','2026-09-10T00:00:00.000Z');
    `);
    legacy.close();

    const database = new StudioDatabase(path);
    databases.push(database);
    expect(database.nodes()).toEqual([expect.objectContaining({ id: "legacy-node", name: "planned" })]);
    expect(database.nodes()[0]).not.toHaveProperty("adapter");
    const columns = database.connection.prepare("SELECT name FROM pragma_table_info('nodes')").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("adapter");
  });
});
