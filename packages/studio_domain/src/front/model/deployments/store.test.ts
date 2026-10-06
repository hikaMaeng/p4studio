import { afterEach, expect, it, vi } from "vitest";
import type { DeploymentGateway } from "./store.js";
import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
async function setup() {
  vi.useFakeTimers(); vi.resetModules();
  const { deployments, emptyDeployment, emptyStage } = await import("./store.js");
  const records = ["a", "b", "c"].map(id => ({ ...emptyDeployment(), id, name: id, stages: [{ ...emptyStage(), id }],
    status: "unknown", reports: [], loadGeneration: 42, operationId: "load", error: "", sessionProof: null,
    resolvedAddresses: {}, createdAt: "created", updatedAt: "revision" } satisfies DeploymentRecord));
  const gateway: DeploymentGateway = {
    list: vi.fn(async () => records), reconcile: vi.fn(async (id: string): Promise<DeploymentRecord> => ({ ...records.find(record => record.id === id)!, status: "unloaded" })),
    operate: vi.fn(async id => records.find(record => record.id === id)!), save: vi.fn(), remove: vi.fn(),
  };
  deployments.start(gateway); await deployments.refresh(); await Promise.resolve();
  return { deployments, gateway, records };
}
it("explicit list refresh observes every model sequentially and preserves successes after a failure", async () => {
  const { deployments, gateway } = await setup();
  const visited: string[] = [];
  gateway.reconcile = vi.fn(async (id: string): Promise<DeploymentRecord> => {
    visited.push(id);
    expect(deployments.tasks.value.get(id)).toBe("inspect");
    expect(deployments.listInspection.value).toBe(true);
    expect(deployments.activity.value.busy).toBe(false);
    if (id === "b") throw new Error("inspection revision changed");
    return { ...deployments.records.value.find(record => record.id === id)!, status: "unloaded" };
  });
  await deployments.reconcileAll();
  expect(visited).toEqual(["a", "b", "c"]);
  expect(deployments.records.value.map(record => record.status)).toEqual(["unloaded", "unknown", "unloaded"]);
  expect(deployments.activity.value).toEqual({ busy: false, error: "inspection revision changed" });
  expect(deployments.tasks.value.size).toBe(0);
  expect(deployments.listInspection.value).toBe(false);
});
it("single model refresh blocks only that model and permits inspection and unloading of other models", async () => {
  const { deployments, gateway, records } = await setup();
  let finish!: (record: DeploymentRecord) => void;
  gateway.reconcile = vi.fn(id => id === "a" ? new Promise<DeploymentRecord>(resolve => { finish = resolve; }) : Promise.resolve(records[1]!));
  const pending = deployments.reconcile("a");
  await deployments.reconcile("a"); await deployments.operate("a", "unload"); await deployments.remove("a", true);
  await deployments.reconcile("b"); await deployments.operate("c", "unload");
  expect(gateway.reconcile).toHaveBeenCalledTimes(2);
  expect(gateway.reconcile).toHaveBeenNthCalledWith(1, "a");
  expect(gateway.reconcile).toHaveBeenNthCalledWith(2, "b");
  expect(gateway.operate).toHaveBeenCalledExactlyOnceWith("c", "unload", undefined);
  expect(gateway.remove).not.toHaveBeenCalled();
  expect(deployments.tasks.value.get("a")).toBe("inspect");
  finish(records[0]!); await pending;
  expect(deployments.activity.value.busy).toBe(false);
});
it("exposes unloading immediately while cancellation or gateway preparation is still pending", async () => {
  const { deployments, gateway, records } = await setup();
  let finish!: (record: DeploymentRecord) => void;
  gateway.operate = vi.fn(() => new Promise<DeploymentRecord>(resolve => { finish = resolve; }));
  const pending = deployments.operate("a", "unload");
  expect(deployments.tasks.value.get("a")).toBe("unload");
  finish({ ...records[0]!, status: "unloaded" }); await pending;
  expect(deployments.tasks.value.size).toBe(0);
  expect(deployments.activity.value.busy).toBe(false);
});
it("keeps two model operations independent when one fails before the other completes", async () => {
  const { deployments, gateway, records } = await setup();
  let finish!: (record: DeploymentRecord) => void, fail!: (error: Error) => void;
  gateway.operate = vi.fn(id => id === "a" ? new Promise<DeploymentRecord>(resolve => { finish = resolve; }) : new Promise<DeploymentRecord>((_, reject) => { fail = reject; }));
  const first = deployments.operate("a", "load"), second = deployments.operate("b", "unload");
  expect([...deployments.tasks.value]).toEqual([["a", "load"], ["b", "unload"]]);
  fail(new Error("unload failed")); await second;
  expect([...deployments.tasks.value]).toEqual([["a", "load"]]);
  expect(deployments.activity.value.error).toBe("unload failed");
  await deployments.operate("a", "unload");
  expect(gateway.operate).toHaveBeenCalledTimes(2);
  finish(records[0]!); await first;
  expect(deployments.tasks.value.size).toBe(0);
});
it("list refresh skips busy models, rejects duplicate list refresh and leaves unvisited models available", async () => {
  const { deployments, gateway, records } = await setup();
  let finishLoad!: (record: DeploymentRecord) => void, finishInspect!: (record: DeploymentRecord) => void;
  gateway.operate = vi.fn(() => new Promise<DeploymentRecord>(resolve => { finishLoad = resolve; }));
  gateway.reconcile = vi.fn(id => id === "b" ? new Promise<DeploymentRecord>(resolve => { finishInspect = resolve; }) : Promise.resolve(records[2]!));
  const load = deployments.operate("a", "load"), refresh = deployments.reconcileAll();
  await Promise.resolve();
  expect([...deployments.tasks.value]).toEqual([["a", "load"], ["b", "inspect"]]);
  await deployments.reconcileAll(); await deployments.reconcile("c");
  expect(gateway.reconcile).toHaveBeenCalledTimes(2);
  finishInspect(records[1]!); await refresh;
  expect(gateway.reconcile).not.toHaveBeenCalledWith("a");
  expect([...deployments.tasks.value]).toEqual([["a", "load"]]);
  expect(deployments.listInspection.value).toBe(false);
  finishLoad(records[0]!); await load;
});
it("does not replace a newer local result with a stale list refresh response", async () => {
  const { deployments, gateway, records } = await setup();
  let finishList!: (records: DeploymentRecord[]) => void;
  gateway.list = vi.fn(() => new Promise<DeploymentRecord[]>(resolve => { finishList = resolve; }));
  const refresh = deployments.refresh();
  await deployments.reconcile("a");
  finishList(records); await refresh;
  expect(deployments.records.value.find(record => record.id === "a")!.status).toBe("unloaded");
});
it("locks an edited model during save without blocking another model", async () => {
  const { deployments, gateway, records } = await setup();
  deployments.open({ ...records[0]!, adapter: "custom", status: "draft" });
  let finish!: (record: DeploymentRecord) => void;
  gateway.save = vi.fn(() => new Promise<DeploymentRecord>(resolve => { finish = resolve; }));
  const saving = deployments.save();
  expect(deployments.tasks.value.get("a")).toBe("save");
  await deployments.operate("a", "load"); await deployments.remove("a", true);
  await deployments.reconcile("b");
  expect(gateway.operate).not.toHaveBeenCalled(); expect(gateway.remove).not.toHaveBeenCalled();
  expect(gateway.reconcile).toHaveBeenCalledExactlyOnceWith("b");
  finish(records[0]!); await saving;
  expect(deployments.tasks.value.size).toBe(0);
});
