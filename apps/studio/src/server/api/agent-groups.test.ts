import { describe, expect, it } from "vitest";
import request from "supertest";
import { StudioDatabase } from "../database/client.js";
import { createApp } from "../app.js";

describe("gateway group management", () => {
  it("persists independent clusters with a node-free gateway and rejects overlap atomically", async () => {
    const db = new StudioDatabase(":memory:");
    try {
      const ids = ["a", "b", "c", "d"].map(name => db.createAgent({ name, host: name, port: 52211 }).id);
      const app = createApp(db);
      const one = { name: "cluster one", gatewayAgentId: ids[0], memberAgentIds: ids.slice(0, 2) };
      const two = { name: "cluster two", gatewayAgentId: ids[2], memberAgentIds: ids.slice(2) };
      const first = (await request(app).post("/api/agent-groups").send(one).expect(201)).body;
      const second = (await request(app).post("/api/agent-groups").send(two).expect(201)).body;
      first.memberAgentIds.sort(); second.memberAgentIds.sort();
      expect(db.nodes()).toEqual([]);
      await request(app).put(`/api/agent-groups/${first.id}`).send({ ...one, memberAgentIds: [ids[0], ids[2]] }).expect(409);
      expect(db.agentGroups.list()).toEqual(expect.arrayContaining([expect.objectContaining(first), expect.objectContaining(second)]));
      await request(app).post("/api/agent-groups").send({ ...one, name: "invalid", memberAgentIds: [ids[1]] }).expect(400);
      await request(app).post("/api/agent-groups").send({ name: "missing", gatewayAgentId: "absent", memberAgentIds: ["absent"] }).expect(409);
      await request(app).delete(`/api/agents/${ids[0]}`).expect(409);
      const updated = await request(app).put(`/api/agent-groups/${first.id}`).send({ ...one, gatewayAgentId: ids[1] }).expect(200);
      expect(updated.body.gatewayAgentId).toBe(ids[1]);
      const topology = await request(app).get("/api/graph-agents").expect(200);
      expect(topology.body.groups).toHaveLength(2);
      await request(app).delete(`/api/agent-groups/${first.id}`).expect(204);
      await request(app).delete(`/api/agents/${ids[0]}`).expect(204);
      expect(db.agentGroups.list()).toEqual([expect.objectContaining(second)]);
    } finally { db.close(); }
  });
});
