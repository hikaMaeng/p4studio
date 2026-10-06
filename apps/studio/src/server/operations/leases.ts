import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { inferenceOwnerSettlementSchema, type DeploymentRecord } from "@p4studio/studio_domain/common";
import { DeploymentRepository } from "../database/deployments.js";
import { AgentGroupRepository } from "../database/agent-groups.js";

type Resource = { key: string; exclusive: boolean };
type Lease = { operationId: string; kind: string; resources: Resource[]; expiresAt: number; revoked: boolean };
type InferenceOwner = { operationId: string; modelId: string; loadGeneration: number; nodes: string[]; tokenHash: string; startedAt: string; settledAt: string | null; submitted?: number };
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const ownershipNodes = (record: DeploymentRecord) => record.stages.map(stage => JSON.stringify([stage.agentId, stage.nodeId, stage.nodeGeneration]));
const TTL_MS = 30_000;
const conflicts = (left: Resource[], right: Resource[]) => left.some(a => right.some(b => a.key === b.key && (a.exclusive || b.exclusive)));
export class OperationLeases {
  constructor(private readonly db: DatabaseSync) {
    db.exec("CREATE TABLE IF NOT EXISTS studio_operation_leases(operation_id TEXT PRIMARY KEY, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS studio_inference_owners(operation_id TEXT PRIMARY KEY, document TEXT NOT NULL)");
  }
  inferenceOwners(): InferenceOwner[] { return this.db.prepare("SELECT document FROM studio_inference_owners").all().map(row => JSON.parse(String(row.document)) as InferenceOwner); }
  private saveOwner(owner: InferenceOwner) { this.db.prepare("INSERT OR REPLACE INTO studio_inference_owners(operation_id,document) VALUES (?,?)").run(owner.operationId, JSON.stringify(owner)); }
  /** Admission and its durable owner are committed synchronously before SESSION. TTL is never settlement. */
  beginInference(operationId: string, record: DeploymentRecord, ownerToken: string) {
    const nodes = ownershipNodes(record), owners = this.inferenceOwners(), previous = owners.find(owner => owner.operationId === operationId);
    if (previous && (previous.tokenHash !== tokenHash(ownerToken) || previous.modelId !== record.id || previous.loadGeneration !== record.loadGeneration || JSON.stringify(previous.nodes) !== JSON.stringify(nodes) || previous.settledAt)) throw new Error("Inference owner identity changed or already settled");
    if (previous && !this.all().some(lease => lease.operationId === operationId)) throw new Error("The original inference lease ended; unload or recover its unresolved owner instead of replaying it");
    if (owners.some(owner => owner.operationId !== operationId && !owner.settledAt && (owner.modelId === record.id && owner.loadGeneration === record.loadGeneration || owner.nodes.some(node => nodes.includes(node))))) throw new Error("Previous request settlement is unknown for this LOAD generation; unload or recover the model before starting another session");
    const result = this.acquire(operationId, this.modelResources(record), "inference");
    if (!previous) this.saveOwner({ operationId, modelId: record.id, loadGeneration: record.loadGeneration, nodes, tokenHash: tokenHash(ownerToken), startedAt: new Date().toISOString(), settledAt: null });
    return result;
  }
  settleInference(operationId: string, loadGeneration: number, submitted: number, ownerToken: string) {
    const owner = this.inferenceOwners().find(value => value.operationId === operationId);
    if (!owner || owner.loadGeneration !== loadGeneration || owner.tokenHash !== tokenHash(ownerToken)) throw new Error("Settlement does not identify the original inference owner");
    if (owner.settledAt) return;
    owner.submitted = submitted; owner.settledAt = new Date().toISOString(); this.saveOwner(owner);
  }
  private all(): Lease[] {
    return this.db.prepare("SELECT document FROM studio_operation_leases").all().map(row => JSON.parse(String(row.document)) as Lease).filter(value => value.expiresAt > Date.now());
  }
  private save(lease: Lease) { this.db.prepare("INSERT OR REPLACE INTO studio_operation_leases(operation_id,document) VALUES (?,?)").run(lease.operationId, JSON.stringify(lease)); }
  release(id: string) { this.db.prepare("DELETE FROM studio_operation_leases WHERE operation_id=?").run(id); }
  acquire(operationId: string, resources: Resource[], kind = "inference", preempt: false | "inference" | "all" = false) {
    const active = this.all(), previous = active.find(value => value.operationId === operationId);
    if (previous) {
      if (previous.revoked || previous.kind !== kind || JSON.stringify(previous.resources) !== JSON.stringify(resources)) throw new Error("Operation lease identity changed or was revoked");
      previous.expiresAt = kind === "recovery" ? Number.MAX_SAFE_INTEGER : Date.now() + TTL_MS; this.save(previous); return this.status(operationId);
    }
    const blocked = active.filter(value => conflicts(resources, value.resources));
    if (blocked.some(value => value.kind === "recovery")) throw new Error("An unresolved agent recovery owns these resources");
    if (blocked.length && (!preempt || preempt !== "all" && blocked.some(value => value.kind !== "inference"))) throw new Error("Another Studio operation owns this model or agent");
    for (const lease of blocked) { lease.revoked = true; this.save(lease); }
    this.save({ operationId, kind, resources, expiresAt: kind === "recovery" ? Number.MAX_SAFE_INTEGER : Date.now() + TTL_MS, revoked: false });
    return this.status(operationId);
  }
  status(operationId: string) {
    const active = this.all(), lease = active.find(value => value.operationId === operationId);
    if (!lease || lease.revoked) throw new Error("Operation lease expired or was revoked for resource recovery");
    return { operationId, expiresAt: lease.expiresAt, ready: !active.some(value => value.operationId !== operationId && conflicts(lease.resources, value.resources)) };
  }
  renew(operationId: string) {
    const lease = this.all().find(value => value.operationId === operationId);
    if (!lease || lease.revoked) throw new Error("Operation lease expired or was revoked for resource recovery");
    lease.expiresAt = lease.kind === "recovery" ? Number.MAX_SAFE_INTEGER : Date.now() + TTL_MS; this.save(lease); return this.status(operationId);
  }
  modelResources(record: DeploymentRecord): Resource[] {
    return [{ key: `model:${record.id}`, exclusive: true }, ...record.stages.map(stage => ({ key: `node:${JSON.stringify([stage.agentId, stage.nodeId])}`, exclusive: true })),
      ...this.receptionAgentIds(record).map(id => ({ key: `agent:${id}`, exclusive: false }))];
  }
  receptionAgentIds(record: DeploymentRecord): string[] {
    const targets = record.stages.map(stage => stage.agentId), groups = new AgentGroupRepository(this.db).list();
    return [...new Set([...targets, ...groups.filter(group => group.memberAgentIds.some(id => targets.includes(id))).map(group => group.gatewayAgentId)])];
  }
  agentResources(agentId: string): Resource[] { return [{ key: `agent:${agentId}`, exclusive: true }]; }
  isRecovery(id: string) { return this.all().some(value => value.operationId === id && value.kind === "recovery"); }
  recoveryOwnsModel(id: string) { return this.all().some(value => value.kind === "recovery" && value.resources.some(resource => resource.key === `model:${id}`)); }
}
const acquisition = z.object({ operationId: z.string().uuid(), modelId: z.string().min(1), expectedUpdatedAt: z.string().min(1), action: z.enum(["load", "unload", "inference"]), ownerToken: z.string().uuid().optional() }).strict().refine(value => value.action !== "inference" || !!value.ownerToken, "Inference admission requires its private owner capability");
export function createLeaseRouter(db: DatabaseSync, leases: OperationLeases) {
  const router = Router(), models = new DeploymentRepository(db);
  router.post("/api/operation-leases", (req, res) => {
    const input = acquisition.safeParse(req.body); if (!input.success) return res.status(400).json({ error: { message: input.error.message } });
    const record = models.get(input.data.modelId); if (!record) return res.status(404).json({ error: { message: "Model not found" } });
    if (record.updatedAt !== input.data.expectedUpdatedAt) return res.status(409).json({ error: { message: "Model changed before lease acquisition; refresh before executing" } });
    try { return res.json(input.data.action === "inference" ? leases.beginInference(input.data.operationId, record, input.data.ownerToken!) : leases.acquire(input.data.operationId, leases.modelResources(record), input.data.action, input.data.action === "unload" ? "inference" : false)); }
    catch (error) { return res.status(409).json({ error: { message: String(error) } }); }
  });
  router.put("/api/operation-leases/:id/settlement", (req, res) => {
    const input = inferenceOwnerSettlementSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: { message: input.error.message } });
    try { leases.settleInference(String(req.params.id), input.data.loadGeneration, input.data.submitted, input.data.ownerToken); return res.status(204).end(); }
    catch (error) { return res.status(409).json({ error: { message: String(error) } }); }
  });
  router.put("/api/operation-leases/:id", (req, res) => { try { return res.json(leases.renew(String(req.params.id))); } catch (error) { return res.status(409).json({ error: { message: String(error) } }); } });
  router.get("/api/operation-leases/:id", (req, res) => { try { return res.json(leases.status(String(req.params.id))); } catch (error) { return res.status(409).json({ error: { message: String(error) } }); } });
  router.delete("/api/operation-leases/:id", (req, res) => { if (leases.isRecovery(String(req.params.id))) return res.status(409).json({ error: { message: "Recovery remains fenced until its host and fresh P4 observation are verified" } }); leases.release(String(req.params.id)); return res.status(204).end(); });
  return router;
}
