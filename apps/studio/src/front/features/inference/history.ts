import { parseInferenceRuns, type InferenceRun } from "@p4studio/studio_domain/common";
import { invalidateLegacyDispatchTiming, migrateLegacyTiming } from "@p4studio/studio_domain/front";
import { isActiveInference } from "@p4studio/studio_domain/front";

export const HISTORY_KEY = "p4studio.inference.history.v1";
type Row = { id: string; run?: InferenceRun; deleted?: boolean; revision?: number };
/** Browser-owned durable history. Each tab writes only its own runs. */
export class BrowserInferenceHistory {
  private database?: Promise<IDBDatabase>;
  private pending: Promise<void> = Promise.resolve();
  private readonly revisions = new Map<string, number>();
  constructor(private readonly snapshot: () => InferenceRun[]) {}
  private open() {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open("p4studio.inference-history", 1);
      const timer = window.setTimeout(() => reject(new Error("Inference history database did not open before its deadline")), 5000);
      request.onupgradeneeded = () => request.result.createObjectStore("runs", { keyPath: "id" });
      request.onsuccess = () => { window.clearTimeout(timer); request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { window.clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { window.clearTimeout(timer); reject(new Error("Another browser owns an incompatible inference history version")); };
    });
  }
  async read(): Promise<unknown> {
    let legacy: unknown = { timingVersion: 3, runs: [] };
    try { const raw = window.localStorage.getItem(HISTORY_KEY); if (raw) legacy = JSON.parse(raw); } catch { /* IndexedDB remains the authority. */ }
    if (!window.indexedDB) return legacy;
    const db = await this.open();
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const transaction = db.transaction("runs", "readonly"), request = transaction.objectStore("runs").getAll();
      request.onsuccess = () => resolve(request.result as Row[]); request.onerror = () => reject(request.error);
    });
    if (!rows.length) return legacy;
    rows.forEach(row => this.revisions.set(row.id, row.revision ?? 0));
    let previous: InferenceRun[] = [];
    try {
      previous = parseInferenceRuns(legacy).runs;
      const version = legacy && typeof legacy === "object" && "timingVersion" in legacy && typeof legacy.timingVersion === "number" ? legacy.timingVersion : 1;
      for (const run of previous) { if (version < 2) run.requests.forEach(migrateLegacyTiming); if (version < 3) run.requests.forEach(invalidateLegacyDispatchTiming); }
    } catch { /* Invalid legacy records never overwrite a committed database row. */ }
    const values = new Map(previous.map(run => [run.id, run]));
    for (const row of rows) { if (row.deleted) values.delete(row.id); else if (row.run) values.set(row.id, row.run); }
    return { timingVersion: 3, runs: [...values.values()] };
  }
  save(run: InferenceRun) { return this.write({ id: run.id, run: structuredClone(run) }); }
  checkpoint(run: InferenceRun) { return this.write({ id: run.id, run: structuredClone(run) }, true); }
  remove(id: string) { return this.write({ id, deleted: true }, false, this.revisions.get(id)); }
  private write(row: Row, mandatory = false, expectedRevision?: number): Promise<void> {
    const work = async () => {
      if (!window.indexedDB) {
        const values = this.snapshot().filter(run => run.id !== row.id); if (row.run) values.push(row.run);
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ timingVersion: 3, runs: values })); return;
      }
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        let failure: Error | undefined;
        const transaction = db.transaction("runs", "readwrite");
        const table = transaction.objectStore("runs"), previous = table.get(row.id);
        previous.onsuccess = () => {
          const saved = previous.result as Row | undefined, old = saved?.run?.ownershipCheckpoint, next = row.run?.ownershipCheckpoint;
          const refuse = (message: string) => { failure = new Error(message); transaction.abort(); };
          if (row.deleted && saved?.run && (isActiveInference(saved.run) || (saved.run.pendingSettlement ?? 0) > 0 || old && old.admitted > old.settled)) { refuse("The committed inference still owns unsettled work; stop or recover it before deleting"); return; }
          if (row.deleted && saved && expectedRevision !== (saved.revision ?? 0)) { refuse("Inference history changed in another tab; refresh before deleting"); return; }
          // A stale automatic snapshot cannot retire a committed admission. Only
          // the original ledger advances the monotonic settlement watermark.
          if (row.run && (saved?.deleted || old && (!next || next.admitted < old.admitted || next.settled < old.settled))) {
            if (mandatory) refuse("The required inference checkpoint was not committed; no further requests may be submitted");
            return;
          }
          row.revision = (saved?.revision ?? 0) + 1;
          table.put(row);
        };
        transaction.oncomplete = () => { if (row.revision !== undefined) this.revisions.set(row.id, row.revision); resolve(); }; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Inference history transaction aborted"));
      });
    };
    const next = this.pending.catch(() => {}).then(work); this.pending = next; return next;
  }
}
