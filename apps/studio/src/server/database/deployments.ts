import type { DatabaseSync } from "node:sqlite";
import { deploymentSchema, type DeploymentInput, type DeploymentRecord } from "@p4studio/studio_domain/common";

/** Durable OUTER plans and receipts; restart never promotes historical readiness to current fact. */
export class DeploymentRepository {
  constructor(private readonly db: DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS model_deployments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, document TEXT NOT NULL)");
    for (const record of this.list()) {
      const proof = record.sessionProof;
      const hasCurrentSessionProof = !!proof && proof.loadGeneration === record.loadGeneration
        && proof.stageIds.length === record.stages.length && record.stages.every(stage => proof.stageIds.includes(stage.id));
      if (record.status === "ready" && !hasCurrentSessionProof) {
        record.status = record.reports.length && record.reports.every(r => r.loadOutcome === "succeeded" && r.resourceState === "present") ? "loaded" : "unknown";
        record.reports.forEach(r => { if (r.state === "ready") r.state = r.loadOutcome === "succeeded" ? "loaded" : "unknown"; });
        this.save(record);
      }
      if (["loading", "loaded", "unloading", "ready"].includes(record.status)) {
        record.status = "unknown"; record.error = "Studio restarted; recorded node state requires reconciliation";
        record.sessionProof = null;
        record.reports.forEach(r => {
          if (["creating", "loading", "loaded", "unloading", "ready"].includes(r.state)) r.state = "unknown";
          delete r.observation;
        });
        this.save(record);
      }
    }
  }
  list(): DeploymentRecord[] { return this.db.prepare("SELECT document FROM model_deployments ORDER BY name").all().map(r => deploymentSchema.parse(JSON.parse(String(r.document)))); }
  get(id: string) { return this.list().find(r => r.id === id); }
  create(input: DeploymentInput): DeploymentRecord {
    const now = new Date().toISOString();
    const record: DeploymentRecord = { ...input, id: crypto.randomUUID(), status: "draft", loadGeneration: 0, operationId: "", reports: [], sessionProof: null, resolvedAddresses: {}, error: "", createdAt: now, updatedAt: now };
    this.db.prepare("INSERT INTO model_deployments (id,name,document) VALUES (?,?,?)").run(record.id, record.name, JSON.stringify(record)); return record;
  }
  save(record: DeploymentRecord) { this.db.prepare("UPDATE model_deployments SET name=?,document=? WHERE id=?").run(record.name, JSON.stringify(record), record.id); }
  remove(id: string) { return this.db.prepare("DELETE FROM model_deployments WHERE id=?").run(id).changes > 0; }
}
