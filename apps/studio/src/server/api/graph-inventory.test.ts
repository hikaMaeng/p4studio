import { describe, expect, it } from "vitest";
import request from "supertest";
import { StudioDatabase } from "../database/client.js";
import { createApp } from "../app.js";

describe("Studio graph metadata", () => {
  it("lists registered agent connection coordinates for browser-owned P4 sessions", async () => {
    const db = new StudioDatabase(":memory:");
    try {
      const first = db.createAgent({ name: "agent-a", host: "10.0.0.1", port: 1232 });
      const second = db.createAgent({ name: "agent-b", host: "10.0.0.2", port: 2232 });
      const app = createApp(db);
      const result = await request(app).get("/api/graph-agents").expect(200);
      expect(result.body).toEqual({ agents: [
        { id: first.id, name: first.name, host: first.host, port: first.port },
        { id: second.id, name: second.name, host: second.host, port: second.port },
      ] });
    } finally { db.close(); }
  });
  it("renames the agent without changing its identity or connection address", async () => {
    const db = new StudioDatabase(":memory:");
    try {
      const agent = db.createAgent({ name: "before", host: "127.0.0.1", port: 1232 });
      const app = createApp(db);
      const result = await request(app).patch(`/api/agents/${agent.id}/name`).send({ name: "after" }).expect(200);
      expect(result.body).toMatchObject({ id: agent.id, name: "after", host: agent.host, port: agent.port });
      await request(app).patch(`/api/agents/${agent.id}/name`).send({ name: " " }).expect(400);
      db.createAgent({ name: "occupied", host: "other", port: 1232 });
      await request(app).patch(`/api/agents/${agent.id}/name`).send({ name: "occupied" }).expect(409);
      expect(db.agent(agent.id)?.name).toBe("after");
    } finally { db.close(); }
  });
  it("stores names by agent/node ID and patches only name within versioned metadata", async () => {
    const db = new StudioDatabase(":memory:");
    try {
      const a = db.createAgent({ name: "a", host: "a", port: 1232 });
      const b = db.createAgent({ name: "b", host: "b", port: 1232 });
      const declared = db.createNode({ agentId: a.id, name: "node/1" });
      const app = createApp(db);
      await request(app).put(`/api/agents/${a.id}/node-labels`).send({ nodeId: "node/1", name: "First stage" }).expect(200);
      db.connection.prepare("UPDATE node_metadata SET metadata_json=json_set(metadata_json,'$.description',?,'$.tags',json(?)) WHERE agent_id=?").run("Keep this", '["gpu","team-a"]', a.id);
      await request(app).put(`/api/agents/${a.id}/node-labels`).send({ nodeId: "node/1", name: "Renamed stage" }).expect(200);
      await request(app).put(`/api/agents/${b.id}/node-labels`).send({ nodeId: "node/1", name: "Other agent stage" }).expect(200);
      const metadata = db.connection.prepare("SELECT * FROM node_metadata WHERE agent_id=?").get(a.id)!;
      expect(JSON.parse(String(metadata.metadata_json))).toEqual({ name: "Renamed stage", description: "Keep this", tags: ["gpu", "team-a"] });
      expect(metadata.revision).toBe(2);
      expect(metadata.schema_version).toBe(1);
      expect(db.nodes()).toContainEqual(declared);
      const result = await request(app).get("/api/node-labels").expect(200);
      expect(result.body.labels).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: a.id, nodeId: "node/1", name: "Renamed stage" }),
        expect.objectContaining({ agentId: b.id, nodeId: "node/1", name: "Other agent stage" }),
      ]));
      await request(app).put(`/api/agents/${a.id}/node-labels`).send({ nodeId: "node/1", name: "" }).expect(400);
      await request(app).put("/api/agents/missing/node-labels").send({ nodeId: "node/1", name: "Unknown" }).expect(404);
    } finally { db.close(); }
  });
});
