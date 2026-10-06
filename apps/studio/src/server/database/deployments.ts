import type { DatabaseSync } from "node:sqlite";
import { deploymentSchema, type DeploymentInput, type DeploymentRecord } from "@p4studio/studio_domain/common";

/** Durable OUTER plans and the last browser-authored lifecycle/inspection receipts. */
export class DeploymentRepository {
  constructor(private readonly db: DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS model_deployments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, document TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS model_deployment_history (revision INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT NOT NULL, recorded_at TEXT NOT NULL, reason TEXT NOT NULL, document TEXT NOT NULL)");
    db.exec("CREATE INDEX IF NOT EXISTS model_deployment_history_by_model ON model_deployment_history(model_id, revision)");
  }
  list(): DeploymentRecord[] { return this.db.prepare("SELECT document FROM model_deployments ORDER BY name").all().map(r => deploymentSchema.parse(JSON.parse(String(r.document)))); }
  get(id: string) { return this.list().find(r => r.id === id); }
  create(input: DeploymentInput): DeploymentRecord {
    const now = new Date().toISOString();
    const record: DeploymentRecord = { ...input, id: crypto.randomUUID(), status: "draft", loadGeneration: 0, operationId: "", reports: [], sessionProof: null, resolvedAddresses: {}, error: "", createdAt: now, updatedAt: now };
    this.db.prepare("INSERT INTO model_deployments (id,name,document) VALUES (?,?,?)").run(record.id, record.name, JSON.stringify(record)); return record;
  }
  history(id: string) { return this.db.prepare("SELECT revision, recorded_at, reason, document FROM model_deployment_history WHERE model_id=? ORDER BY revision DESC").all(id).map(row => ({ revision: row.revision, recordedAt: row.recorded_at, reason: row.reason, record: deploymentSchema.parse(JSON.parse(String(row.document))) })); }
  private archive(record: DeploymentRecord, reason: string) { this.db.prepare("INSERT INTO model_deployment_history(model_id,recorded_at,reason,document) VALUES (?,?,?,?)").run(record.id, new Date().toISOString(), reason, JSON.stringify(record)); }
  save(record: DeploymentRecord) {
    const previous = this.get(record.id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (previous && JSON.stringify(previous) !== JSON.stringify(record)) this.archive(previous, "before-update");
      this.db.prepare("UPDATE model_deployments SET name=?,document=? WHERE id=?").run(record.name, JSON.stringify(record), record.id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  remove(id: string) {
    const previous = this.get(id); if (!previous) return false;
    this.db.exec("BEGIN IMMEDIATE");
    try { this.archive(previous, "before-delete"); const removed = this.db.prepare("DELETE FROM model_deployments WHERE id=?").run(id).changes > 0; this.db.exec("COMMIT"); return removed; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
