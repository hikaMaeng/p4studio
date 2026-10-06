import { afterEach, expect, it, vi } from "vitest";
import type { InferenceRun } from "@p4studio/studio_domain/common";
import { BrowserInferenceHistory } from "./history.js";

afterEach(() => vi.unstubAllGlobals());
function database() {
  const rows = new Map<string, unknown>(), commits: (() => void)[] = [];
  const db = { transaction: () => {
    let id = "", aborted = false, read: { result?: unknown; onsuccess?: () => void } = {}, written: { id: string } | undefined;
    const transaction = { abort: () => { aborted = true; }, onabort: undefined as (() => void) | undefined, oncomplete: undefined as (() => void) | undefined, objectStore: () => ({ get: (key: string) => { id = key; return read; }, put: (row: { id: string }) => { written = structuredClone(row); } }) };
    commits.push(() => { read.result = rows.get(id); read.onsuccess?.(); if (aborted) transaction.onabort?.(); else { if (written) rows.set(written.id, written); transaction.oncomplete?.(); } });
    return transaction;
  } };
  vi.stubGlobal("window", { localStorage: { getItem: () => null }, indexedDB: { open: () => {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } }, setTimeout, clearTimeout });
  const flush = async () => { await vi.waitFor(() => expect(commits.length).toBeGreaterThan(0)); commits.shift()!(); };
  return { rows, flush };
}
const run = (admitted: number, settled = 0, submitted = 0) => ({ id: "run", state: "running", submitted, pendingSettlement: admitted - settled, ownershipCheckpoint: { admitted, settled } }) as InferenceRun;
it("does not let a stale periodic snapshot erase an admission committed before PREFILL", async () => {
  const db = database(), history = new BrowserInferenceHistory(() => []);
  const checkpoint = history.save(run(10)), stale = history.save(run(0)), current = history.save(run(10, 0, 10));
  await db.flush(); await checkpoint;
  await db.flush(); await stale;
  expect(db.rows.get("run")).toMatchObject({ run: { submitted: 0, pendingSettlement: 10, ownershipCheckpoint: { admitted: 10, settled: 0 } } });
  await db.flush(); await current;
  const settled = history.save({ ...run(10, 10, 10), state: "completed" }); await db.flush(); await settled;
  const late = history.save(run(10, 0, 10)); await db.flush(); await late;
  expect(db.rows.get("run")).toMatchObject({ run: { state: "completed", pendingSettlement: 0, ownershipCheckpoint: { admitted: 10, settled: 10 } } });
});
it("does not resurrect a peer-deleted run through a late owner write", async () => {
  const db = database(), history = new BrowserInferenceHistory(() => []);
  const removed = history.remove("run"); await db.flush(); await removed;
  const late = history.save(run(0)); await db.flush(); await late;
  expect(db.rows.get("run")).toMatchObject({ id: "run", deleted: true });
  const mandatory = history.checkpoint(run(10)); const rejected = expect(mandatory).rejects.toThrow("not committed"); await db.flush(); await rejected;
});
it("atomically rejects stale deletion of a currently admitted owner", async () => {
  const db = database(), owner = new BrowserInferenceHistory(() => []), peer = new BrowserInferenceHistory(() => []);
  const checkpoint = owner.checkpoint(run(10)); await db.flush(); await checkpoint;
  const removal = peer.remove("run"), rejected = expect(removal).rejects.toThrow("unsettled work"); await db.flush(); await rejected;
  const next = owner.checkpoint(run(20, 0, 10)); await db.flush(); await next;
  expect(db.rows.get("run")).toMatchObject({ run: { pendingSettlement: 20, ownershipCheckpoint: { admitted: 20, settled: 0 } } });
});
it("rejects a mandatory checkpoint whose new admission would be discarded by rollback protection", async () => {
  const db = database(), history = new BrowserInferenceHistory(() => []);
  const settled = history.save({ ...run(10, 10, 10), state: "completed" }); await db.flush(); await settled;
  const invalid = history.checkpoint(run(20, 0, 10)), rejected = expect(invalid).rejects.toThrow("not committed"); await db.flush(); await rejected;
  expect(db.rows.get("run")).toMatchObject({ run: { ownershipCheckpoint: { admitted: 10, settled: 10 } } });
});
