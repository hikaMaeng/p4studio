import { expect, it } from "vitest";
import { resolveAgentReception, type AgentGroup } from "./index.js";

it("keeps isolated group gateways distinct and ungrouped agents direct", () => {
  const agents = ["a", "b", "c", "d", "e"].map(id => ({ id, host: id, port: 52211 }));
  const groups: AgentGroup[] = [
    { id: "one", name: "one", gatewayAgentId: "a", memberAgentIds: ["a", "b"] },
    { id: "two", name: "two", gatewayAgentId: "c", memberAgentIds: ["c", "d"] },
  ];
  expect(resolveAgentReception("b", agents, groups)).toEqual({ agentId: "a", address: "tcp://a:52211", groupId: "one" });
  expect(resolveAgentReception("d", agents, groups).agentId).toBe("c");
  expect(resolveAgentReception("e", agents, groups)).toEqual({ agentId: "e", address: "tcp://e:52211", groupId: null });
  expect(() => resolveAgentReception("b", agents.filter(a => a.id !== "a"), groups)).toThrow("gateway");
  expect(() => resolveAgentReception("b", agents, [...groups, { ...groups[1]!, memberAgentIds: ["b", "c"] }])).toThrow("multiple");
});
