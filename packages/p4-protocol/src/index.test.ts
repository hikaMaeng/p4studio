import { describe, expect, it } from "vitest";
import { P4_AGENT_OPERATIONS, P4_PROTOCOL } from "./index.js";

describe("P4 public boundary", () => {
  it("pins the currently audited wire versions", () => {
    expect(P4_PROTOCOL).toEqual({ frameVersion: 8, eventVersion: 3, statusSchemaVersion: 6 });
  });

  it("does not expose inference relay as a studio operation", () => {
    expect(P4_AGENT_OPERATIONS).not.toContain("relay-inference");
  });
});
