import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./routes.js";

describe("Studio page routes", () => {
  it("maps menu, detail, tab, and registration URLs to distinct surfaces", () => {
    expect(parseRoute("/agents/a%20one/nodes")).toEqual({ kind: "agent-detail", agentId: "a one", tab: "nodes" });
    expect(parseRoute("/agents/a/nodes/new")).toEqual({ kind: "agent-node-new", agentId: "a" });
    expect(parseRoute("/models/deployment-1/edit")).toEqual({ kind: "model-edit", modelId: "deployment-1" });
    expect(parseRoute("/inference/monitoring")).toEqual({ kind: "inference", tab: "monitoring" });
    expect(parseRoute("/inference/history")).toEqual({ kind: "inference", tab: "history" });
    expect(parseRoute("/inference/history/run%20one")).toEqual({ kind: "inference-history-detail", runId: "run one" });
    expect(parseRoute("/inference/requests/request%20one")).toEqual({ kind: "inference-request-detail", requestId: "request one" });
  });

  it("encodes detail identifiers when constructing bookmark URLs", () => {
    expect(routePath({ kind: "agent-detail", agentId: "a one", tab: "information" })).toBe("/agents/a%20one/information");
    expect(routePath({ kind: "model-new" })).toBe("/models/new");
    expect(routePath({ kind: "inference", tab: "query" })).toBe("/inference/query");
    expect(routePath({ kind: "inference", tab: "history" })).toBe("/inference/history");
    expect(routePath({ kind: "inference-history-detail", runId: "run one" })).toBe("/inference/history/run%20one");
    expect(routePath({ kind: "inference-request-detail", requestId: "request one" })).toBe("/inference/requests/request%20one");
  });
});
it("restores gateway group list, creation, detail and edit URLs including encoded IDs", () => {
  for (const route of [
    { kind: "agent-groups" }, { kind: "agent-group-new" },
    { kind: "agent-group-detail", groupId: "cluster/한글 ?#" },
    { kind: "agent-group-edit", groupId: "cluster/한글 ?#" },
  ] as const) expect(parseRoute(routePath(route))).toEqual(route);
  expect(parseRoute("/agent-groups/id/invalid")).toEqual({ kind: "agent-group-detail", groupId: "" });
});
