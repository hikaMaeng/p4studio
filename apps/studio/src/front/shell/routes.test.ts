import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "./routes.js";

describe("Studio page routes", () => {
  it("maps menu, detail, tab, and registration URLs to distinct surfaces", () => {
    expect(parseRoute("/agents/a%20one/nodes")).toEqual({ kind: "agent-detail", agentId: "a one", tab: "nodes" });
    expect(parseRoute("/agents/a/nodes/new")).toEqual({ kind: "agent-node-new", agentId: "a" });
    expect(parseRoute("/models/deployment-1/edit")).toEqual({ kind: "model-edit", modelId: "deployment-1" });
    expect(parseRoute("/inference/monitoring")).toEqual({ kind: "inference", tab: "monitoring" });
  });

  it("encodes detail identifiers when constructing bookmark URLs", () => {
    expect(routePath({ kind: "agent-detail", agentId: "a one", tab: "information" })).toBe("/agents/a%20one/information");
    expect(routePath({ kind: "model-new" })).toBe("/models/new");
    expect(routePath({ kind: "inference", tab: "query" })).toBe("/inference/query");
  });
});
