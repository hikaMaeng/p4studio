import { expect, it } from "vitest";
import { checkBuilds, supportedWireAbi } from "./compatibility.js";

// P4 staged adapter build_identity::known_wire_abi only speaks p4pb6le64
// (P4LB v5, P4PB v6/v7); earlier families are refused before LOAD.
const good = `p4pb6le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`;
const identity = (wire: unknown) => ({ upstream_commit: "pin", patch_set: "patch", backend_inventory: "CPU", stage_wire_abi: wire });

it("p4pb6le64 보고 노드를 거부하지 않는다", () => {
  expect(supportedWireAbi(good)).toBe(true);
  expect(() => checkBuilds([identity(good), identity(good)], "physical-wire-v4")).not.toThrow();
});

it.each([
  `p4pb4le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`,
  `p4pb5le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`,
])("구 ABI 계열을 거부한다: %s", wire => {
  expect(supportedWireAbi(wire)).toBe(false);
  expect(() => checkBuilds([identity(wire), identity(wire)], "physical-wire-v4")).toThrow(/ABI/);
  expect(() => checkBuilds([identity(wire), identity(wire)])).toThrow(/does not speak/);
});

it.each([
  `p4pb6le64:${"a".repeat(63)}:types=0/1/4,1/1/2,2/32/18`,
  `p4pb6le64:${"g".repeat(64)}:types=0/1/4,1/1/2,2/32/18`,
  `p4pb6le64:${"a".repeat(64)}:types=9/9/9,1/1/2,2/32/18`,
  `p4pb6le64:${"a".repeat(64)}:types=0/1/4,2/32/18`,
  `p4pb6le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32`,
  "unknown",
  "",
  null,
])("잘못된 hash·type 목록·미식별 ABI를 physical-wire-v4에서 거부한다: %s", wire => {
  expect(supportedWireAbi(wire)).toBe(false);
  expect(() => checkBuilds([identity(wire), identity(wire)], "physical-wire-v4")).toThrow(/ABI/);
});

it("stage 간 ABI 불일치를 거부한다", () => {
  const other = good.replace("aaaa", "bbbb");
  expect(() => checkBuilds([identity(good), identity(other)], "physical-wire-v4")).toThrow(/stage_wire_abi/);
});

it("exact-build에서도 보고된 미지원 ABI를 거부하고 미보고 wire는 worker LOAD에 맡긴다", () => {
  const old = `p4pb5le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`;
  expect(() => checkBuilds([identity(old), identity(old)])).toThrow(/does not speak/);
  expect(() => checkBuilds([identity("unknown"), identity("unknown")])).not.toThrow();
  expect(() => checkBuilds([{ upstream_commit: "pin", patch_set: "patch", backend_inventory: "CPU" }])).not.toThrow();
});
