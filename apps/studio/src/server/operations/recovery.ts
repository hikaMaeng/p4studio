import { Router } from "express";
import { z } from "zod";
import { type RecoveryOperation, recoveryOperationSchema } from "../../common/recovery.js";
import type { StudioDatabase } from "../database/client.js";
import { DeploymentRepository } from "../database/deployments.js";
import { OperationLeases } from "./leases.js";
import { WindowsHostManager, type ManagementProfile } from "./windows.js";

const now = () => new Date().toISOString();
type Manager = Pick<WindowsHostManager, "inspect" | "recover" | "resume">;
export class AgentRecovery {
  private readonly models: DeploymentRepository;
  constructor(private readonly db: StudioDatabase, private readonly leases: OperationLeases, private readonly profiles: ManagementProfile[], private readonly host: Manager = new WindowsHostManager()) {
    this.models = new DeploymentRepository(db.connection);
    db.connection.exec("CREATE TABLE IF NOT EXISTS agent_recovery_operations(id TEXT PRIMARY KEY, document TEXT NOT NULL)");
    for (const operation of this.list()) if (["stopping", "starting"].includes(operation.state)) { operation.state = "unknown"; operation.firstError ??= "Studio restarted during host management; inspect the same operation before taking further action"; this.save(operation); }
  }
  list(agentId?: string): RecoveryOperation[] { return this.db.connection.prepare("SELECT document FROM agent_recovery_operations ORDER BY rowid DESC").all().map(row => recoveryOperationSchema.parse(JSON.parse(String(row.document)))).filter(value => !agentId || value.agentId === agentId); }
  get(id: string) { const operation = this.list().find(value => value.id === id); if (!operation) throw new Error("Recovery operation not found"); return operation; }
  private save(operation: RecoveryOperation) { operation.updatedAt = now(); this.db.connection.prepare("INSERT OR REPLACE INTO agent_recovery_operations(id,document) VALUES (?,?)").run(operation.id, JSON.stringify(operation)); }
  configured(id: string) { return this.profiles.some(profile => profile.agentId === id); }
  private profile(id: string) {
    const profile = this.profiles.find(value => value.agentId === id), agent = this.db.agent(id);
    if (!profile || !agent || agent.host !== profile.host || agent.port !== profile.port) throw new Error("No approved host-management profile matches this registered agent");
    return profile;
  }
  async plan(agentId: string, id: string) {
    const previous = this.list().find(value => value.id === id); if (previous) { if (previous.agentId !== agentId) throw new Error("Recovery id belongs to another agent"); return previous; }
    const profile = this.profile(agentId), before = await this.host.inspect(profile), agent = this.db.agent(agentId)!;
    const affected = this.models.list().filter(model => this.leases.receptionAgentIds(model).includes(agentId) && model.loadGeneration > 0).map(model => ({ modelId: model.id, modelName: model.name, revision: model.updatedAt, loadGeneration: model.loadGeneration, stageIds: model.stages.filter(stage => stage.agentId === agentId).map(stage => stage.id) }));
    const operation: RecoveryOperation = { id, agentId, agentName: agent.name, address: `tcp://${profile.host}:${profile.port}`, createdAt: now(), updatedAt: now(), state: "prepared", before, after: null, affected, firstError: null, cleanupError: null, stopped: false, inspectedAt: null, hostConfirmedAt: null, retry: null, attempts: [] };
    this.save(operation); return operation;
  }
  execute(id: string) {
    const operation = this.get(id), profile = this.profile(operation.agentId);
    if (operation.state !== "prepared") return operation;
    if (Date.now() - Date.parse(operation.createdAt) > 60_000) throw new Error("Recovery plan expired; inspect again with a new operation id");
    for (const affected of operation.affected) { const current = this.models.get(affected.modelId); if (!current || current.updatedAt !== affected.revision || current.loadGeneration !== affected.loadGeneration) throw new Error("Affected model changed after the recovery plan; inspect again"); }
    const currentIds = this.models.list().filter(model => model.loadGeneration > 0 && this.leases.receptionAgentIds(model).includes(operation.agentId)).map(model => model.id).sort();
    if (JSON.stringify(currentIds) !== JSON.stringify(operation.affected.map(value => value.modelId).sort())) throw new Error("Affected model set changed after the recovery plan");
    this.leases.acquire(id, [...this.leases.agentResources(operation.agentId), ...operation.affected.flatMap(value => this.leases.modelResources(this.models.get(value.modelId)!))], "recovery", "all");
    operation.state = "stopping"; this.save(operation);
    void this.perform(operation, profile); return operation;
  }
  private async perform(operation: RecoveryOperation, profile: ManagementProfile, startOnly = false, attempt?: NonNullable<RecoveryOperation["retry"]>) {
    try {
      const deadline = Date.now() + 35_000;
      while (!this.leases.status(operation.id).ready) { if (Date.now() >= deadline) throw new Error("Studio owners did not quiesce before recovery; no host mutation was started"); await new Promise(resolve => setTimeout(resolve, 250)); }
      operation.after = await this.host[startOnly ? "resume" : "recover"](profile, attempt?.id ?? operation.id, attempt?.before ?? operation.before, (phase, stopped) => { operation.state = phase === "starting" ? "starting" : "stopping"; operation.stopped = stopped; this.save(operation); });
      operation.stopped = true; operation.state = "verifying"; operation.hostConfirmedAt = now(); this.save(operation);
    } catch (error) { const detail = error instanceof Error ? error.message : String(error); if (attempt) { const saved = operation.attempts.find(value => value.id === attempt.id); if (saved) saved.error = detail; } if (operation.firstError) operation.cleanupError = detail; else operation.firstError = detail; operation.state = "unknown"; this.save(operation); }
  }
  async reviewRetry(id: string) {
    const operation = this.get(id);
    if (operation.state !== "unknown" || operation.after || operation.stopped) throw new Error("Verify fresh startup or resume a confirmed stopped installation first");
    const before = await this.host.inspect(this.profile(operation.agentId));
    // Re-read after SSH: another action must not be overwritten by this review.
    const current = this.get(id);
    if (current.updatedAt !== operation.updatedAt || current.state !== "unknown") throw new Error("Recovery changed during inspection; refresh the operation");
    current.retry = { id: crypto.randomUUID(), reviewedAt: now(), before }; this.save(current); return current;
  }
  retry(id: string, attemptId: string) {
    const operation = this.get(id), attempt = operation.retry;
    if (operation.state !== "unknown" || operation.after || operation.stopped || !attempt || attempt.id !== attemptId || Date.now() - Date.parse(attempt.reviewedAt) > 60_000) throw new Error("Review the current resource identities again before continuing recovery");
    for (const affected of operation.affected) if (this.models.get(affected.modelId)?.loadGeneration !== affected.loadGeneration) throw new Error("Model generation changed during recovery");
    this.leases.status(id); operation.attempts.push({ id: attempt.id, before: attempt.before, startedAt: now(), error: null });
    operation.retry = null; operation.state = "stopping"; this.save(operation); void this.perform(operation, this.profile(operation.agentId), false, attempt); return operation;
  }
  resume(id: string) {
    const operation = this.get(id);
    if (!operation.stopped || operation.after || operation.state !== "unknown") throw new Error("Only a confirmed stopped installation with unconfirmed startup can resume");
    operation.state = "starting"; this.save(operation); void this.perform(operation, this.profile(operation.agentId), true); return operation;
  }
  async reprobe(id: string) {
    const operation = this.get(id); if (!["unknown", "verifying"].includes(operation.state)) return operation;
    const current = await this.host.inspect(this.profile(operation.agentId));
    if (this.get(id).updatedAt !== operation.updatedAt) throw new Error("Recovery changed during host inspection; refresh the operation");
    if (current.agentPid > 0 && (current.agentPid !== operation.before.agentPid || current.agentBorn !== operation.before.agentBorn) && current.processes.length === 1 && current.ports.every(port => port === this.profile(operation.agentId).port)) {
      operation.stopped = true; operation.after = current; operation.state = "verifying"; operation.hostConfirmedAt = now(); this.save(operation);
    }
    return operation;
  }
  async cancel(id: string) {
    const operation = this.get(id);
    if (operation.state === "prepared") { operation.state = "failed"; operation.firstError = "Recovery plan closed without executing"; this.save(operation); return operation; }
    if (operation.state !== "unknown" || operation.stopped || operation.after) throw new Error("Recovery has resource effects or is still running; verify or resume it before releasing its fence");
    const current = await this.host.inspect(this.profile(operation.agentId));
    if (this.get(id).updatedAt !== operation.updatedAt) throw new Error("Recovery changed during host inspection; refresh the operation");
    const identities = (proof: typeof current) => proof.processes.map(value => JSON.stringify([value.pid, value.born, value.path, value.command])).sort().join(";");
    if (identities(current) !== identities(operation.before) || JSON.stringify([...current.ports].sort()) !== JSON.stringify([...operation.before.ports].sort())) throw new Error("Resources changed during recovery; no-effect closure cannot be proved");
    operation.state = "failed"; this.save(operation); this.leases.release(id); return operation;
  }
  async verify(id: string, input: { observedAt: string; agentPid: number; agentBorn: string; nodes: number }) {
    const operation = this.get(id); if (operation.state === "recovered") return operation;
    if (!operation.stopped || !operation.after || !["verifying", "unknown"].includes(operation.state)) throw new Error("The old tree stop and new host startup have not both been confirmed");
    if (input.nodes !== 0 || input.agentPid !== operation.after.agentPid || input.agentBorn !== operation.after.agentBorn || Date.parse(input.observedAt) < Date.parse(operation.hostConfirmedAt ?? operation.updatedAt) || Math.abs(Date.now() - Date.parse(input.observedAt)) > 30_000) throw new Error("P4 observation is stale or not bound to the fresh host proof");
    const current = await this.host.inspect(this.profile(operation.agentId));
    if (this.get(id).updatedAt !== operation.updatedAt) throw new Error("Recovery changed during host inspection; refresh the operation");
    if (current.agentPid !== operation.after.agentPid || current.agentBorn !== operation.after.agentBorn || current.processes.length !== 1 || current.ports.some(port => port !== this.profile(operation.agentId).port)) throw new Error("Host changed before fresh P4 observation was committed");
    for (const affected of operation.affected) {
      const model = this.models.get(affected.modelId); if (!model || model.loadGeneration !== affected.loadGeneration) throw new Error("Model generation changed during recovery");
      for (const stageId of affected.stageIds) { const report = model.reports.find(value => value.stageId === stageId); if (report) { report.state = "absent"; report.resourceState = "absent"; report.detail = `Forced recovery ${operation.id}; previous UNLOAD result is retained`; report.recovery = { operationId: operation.id, kind: "forced", observedAt: input.observedAt }; } }
      model.status = model.reports.every(report => report.resourceState === "absent") ? "absent" : "unknown"; model.sessionProof = null;
      model.updatedAt = new Date(Math.max(Date.now(), Date.parse(model.updatedAt) + 1)).toISOString(); this.models.save(model);
    }
    operation.inspectedAt = input.observedAt; operation.state = "recovered"; this.save(operation); this.leases.release(operation.id); return operation;
  }
}

export function createRecoveryRouter(recovery: AgentRecovery) {
  const router = Router(), base = "/api/agent-recovery";
  router.use(base, (req, res, next) => { if (!["GET", "HEAD"].includes(req.method)) { const origin = req.get("origin"); if (origin && origin !== `${req.protocol}://${req.get("host")}`) return res.status(403).json({ error: { message: "Recovery requires the Studio origin" } }); if (req.get("x-p4studio-action") !== "recovery") return res.status(403).json({ error: { message: "Recovery requires an explicit action header" } }); } return next(); });
  const handle = (operation: () => unknown | Promise<unknown>, res: import("express").Response, status = 200) => { void Promise.resolve().then(operation).then(value => res.status(status).json(value)).catch(error => res.status(409).json({ error: { message: error instanceof Error ? error.message : String(error) } })); };
  router.get(`${base}/agents/:id`, (req, res) => res.json({ configured: recovery.configured(String(req.params.id)), operations: recovery.list(String(req.params.id)) }));
  router.post(`${base}/agents/:id/plan`, (req, res) => { const input = z.object({ operationId: z.string().uuid() }).strict().safeParse(req.body); if (!input.success) return res.status(400).json({ error: { message: input.error.message } }); handle(() => recovery.plan(String(req.params.id), input.data.operationId), res, 201); });
  router.get(`${base}/operations/:id`, (req, res) => handle(() => recovery.get(String(req.params.id)), res));
  router.post(`${base}/operations/:id/reprobe`, (req, res) => handle(() => recovery.reprobe(String(req.params.id)), res));
  router.post(`${base}/operations/:id/review-retry`, (req, res) => handle(() => recovery.reviewRetry(String(req.params.id)), res));
  router.post(`${base}/operations/:id/retry`, (req, res) => handle(() => { if (req.body?.confirm !== String(req.params.id)) throw new Error("Confirm the reviewed recovery operation id"); return recovery.retry(String(req.params.id), z.string().uuid().parse(req.body.attemptId)); }, res, 202));
  router.post(`${base}/operations/:id/cancel`, (req, res) => handle(() => recovery.cancel(String(req.params.id)), res));
  router.post(`${base}/operations/:id/resume`, (req, res) => handle(() => { if (req.body?.confirm !== String(req.params.id)) throw new Error("Confirm the reviewed recovery operation id"); return recovery.resume(String(req.params.id)); }, res, 202));
  router.post(`${base}/operations/:id/execute`, (req, res) => handle(() => { if (req.body?.confirm !== String(req.params.id)) throw new Error("Confirm the reviewed recovery operation id"); return recovery.execute(String(req.params.id)); }, res, 202));
  router.post(`${base}/operations/:id/verify`, (req, res) => handle(() => recovery.verify(String(req.params.id), z.object({ observedAt: z.string().datetime(), agentPid: z.number().int().positive(), agentBorn: z.string(), nodes: z.number().int().nonnegative() }).strict().parse(req.body)), res));
  return router;
}
