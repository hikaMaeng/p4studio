import { describe, expect, it, vi } from "vitest";
import { AgentRemovalStore } from "./removal.js";

describe("agent removal confirmation", () => {
  it("cancels without a request and prevents duplicate requests or target switches while pending", async () => {
    const store = new AgentRemovalStore();
    const remove = vi.fn(async () => "deleted" as const);
    store.open({ id: "one", name: "One" }); store.close();
    await store.confirm(remove); expect(remove).not.toHaveBeenCalled();
    let resolve!: (result: "deleted") => void;
    const pending = vi.fn(() => new Promise<"deleted">(done => { resolve = done; }));
    store.open({ id: "one", name: "One" });
    const confirmation = store.confirm(pending);
    store.close(); store.open({ id: "two", name: "Two" });
    await store.confirm(pending);
    expect(store.dialog.value.target?.id).toBe("one");
    expect(pending).toHaveBeenCalledTimes(1);
    resolve("deleted"); expect(await confirmation).toBe("one");
    expect(store.dialog.value.target).toBeNull();
  });
  it("preserves a rejected target and distinguishes transport uncertainty from a dependency conflict", async () => {
    const store = new AgentRemovalStore(); store.open({ id: "one", name: "One" });
    expect(await store.confirm(async () => "in_use")).toBeUndefined();
    expect(store.dialog.value).toMatchObject({ target: { id: "one" }, busy: false, error: "in_use" });
    await store.confirm(async () => { throw new Error("connection lost"); });
    expect(store.dialog.value).toMatchObject({ target: { id: "one" }, busy: false, error: "unknown" });
    expect(await store.confirm(async () => "missing")).toBe("one");
    expect(store.dialog.value.target).toBeNull();
  });
});
