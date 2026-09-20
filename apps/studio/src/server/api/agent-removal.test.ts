import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { StudioDatabase } from "../database/client.js";
import { AgentObservationStore } from "../agent-socket/inspection/store.js";
import { createApp } from "../app.js";

const databases: StudioDatabase[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));
const setup = () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const observations = new AgentObservationStore();
  const agent = database.createAgent({ name: "remove-me", host: "offline.invalid", port: 52211 });
  return { database, agent, app: createApp(database, observations) };
};
describe("agent registration removal", () => {
  it("removes an offline registration and its labels while preserving other registrations", async () => {
    const { database, agent, app } = setup();
    const other = database.createAgent({ name: "keep-me", host: "other.invalid", port: 52211 });
    database.renameNode(agent.id, { nodeId: "remote-node", name: "label" });
    database.renameNode(other.id, { nodeId: "keep-node", name: "keep-label" });
    await request(app).delete(`/api/agents/${agent.id}`).expect(204);
    expect(database.agents().map(value => value.id)).toEqual([other.id]);
    expect(database.nodeLabels()).toEqual([expect.objectContaining({ agentId: other.id })]);
    await request(app).delete(`/api/agents/${agent.id}`).expect(404);
    expect((await request(app).get("/api/snapshot")).body.agents.map((value: { id: string }) => value.id)).toEqual([other.id]);
  });
  it("retains an agent and its labels when a Studio node declaration references it", async () => {
    const { database, agent, app } = setup();
    const node = database.createNode({ agentId: agent.id, name: "declared" });
    database.renameNode(agent.id, { nodeId: "declared", name: "label" });
    const response = await request(app).delete(`/api/agents/${agent.id}`).expect(409);
    expect(response.body.error.code).toBe("agent_in_use");
    expect(database.agent(agent.id)).toBeDefined();
    expect(database.nodes()).toEqual([node]);
    expect(database.nodeLabels()).toHaveLength(1);
  });
  it("retains both gateway and member registrations until their group is removed", async () => {
    const { database, agent, app } = setup();
    const member = database.createAgent({ name: "member", host: "member.invalid", port: 52211 });
    const group = database.agentGroups.save({ name: "group", gatewayAgentId: agent.id, memberAgentIds: [agent.id, member.id] });
    for (const id of [agent.id, member.id]) await request(app).delete(`/api/agents/${id}`).expect(409);
    expect(database.agentGroups.list()).toEqual([{ ...group, memberAgentIds: [...group.memberAgentIds].sort() }]);
    database.agentGroups.remove(group.id);
    await request(app).delete(`/api/agents/${agent.id}`).expect(204);
    expect(database.agent(member.id)).toBeDefined();
  });
});
