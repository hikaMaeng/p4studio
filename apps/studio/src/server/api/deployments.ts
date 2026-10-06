import { Router } from "express";
import {
  deploymentInputSchema,
  deploymentReceiptSchema,
  deploymentReconciliationSchema,
  deploymentRoutes,
  canStartDeployment,
  type DeploymentErrorResponse,
  type DeploymentListResponse,
} from "@p4studio/studio_domain/common";
import type { StudioDatabase } from "../database/client.js";
import { DeploymentRepository } from "../database/deployments.js";
import { OperationLeases } from "../operations/leases.js";

const rejected = (message: string): DeploymentErrorResponse => ({ error: { code: "deployment_rejected", message } });
// Revision tokens never repeat, including same-ms writes and backwards host clocks.
const nextRevision = (previous: string) => new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();

/** Persists declarations and browser-authored receipts; it never runs P4. */
export function createDeploymentRouter(database: StudioDatabase) {
  const router = Router();
  const repository = new DeploymentRepository(database.connection);
  const leases = new OperationLeases(database.connection);
  router.use("/api/model-deployments/:id", (req, res, next) => {
    if ((req.method === "DELETE" || req.method === "PUT" && req.path === "/") && leases.recoveryOwnsModel(String(req.params.id))) return res.status(409).json(rejected("Agent recovery owns this model; finish its verification before editing or deleting"));
    return next();
  });
  router.get(deploymentRoutes.list.path, (_req, res) => res.json({ deployments: repository.list() } satisfies DeploymentListResponse));
  router.get("/api/model-deployments/:id/history", (req, res) => { const id = String(req.params.id), current = repository.get(id); return res.json({ history: [...(current ? [{ revision: 0, recordedAt: current.updatedAt, reason: "current", record: current }] : []), ...repository.history(id)] }); });
  router.post(deploymentRoutes.create.path, (req, res) => {
    const input = deploymentInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    try { return res.status(201).json(repository.create(input.data)); }
    catch (error) { return res.status(409).json(rejected(String(error))); }
  });
  router.delete(deploymentRoutes.remove.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    // Deleting a declaration does not UNLOAD remote P4 resources.
    if (!canStartDeployment(record)) return res.status(409).json(rejected("Unload or reconcile this deployment before deletion; its load ownership must remain available for recovery"));
    if (!repository.remove(record.id)) return res.status(404).json(rejected("Model not found"));
    return res.status(204).end();
  });
  router.put(deploymentRoutes.update.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    if (!canStartDeployment(record)) return res.status(409).json(rejected("Recover or inspect the previous load before editing its placement"));
    const input = deploymentInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    Object.assign(record, input.data, { status: "draft", reports: [], sessionProof: null, resolvedAddresses: {}, error: "", operationId: "", updatedAt: nextRevision(record.updatedAt) });
    repository.save(record); return res.json(record);
  });
  router.put(deploymentRoutes.receipt.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    const receipt = deploymentReceiptSchema.safeParse(req.body);
    if (!receipt.success) return res.status(400).json(rejected(receipt.error.message));
    const { expectedUpdatedAt, stageGenerations, ...data } = receipt.data;
    if (data.loadGeneration < record.loadGeneration) return res.status(409).json(rejected("An older LOAD receipt cannot replace current ownership"));
    if (leases.recoveryOwnsModel(record.id) && (data.loadGeneration !== record.loadGeneration || ["loading", "loaded", "ready"].includes(data.status))) return res.status(409).json(rejected("Agent recovery has fenced new admission and ready promotion"));
    if (record.updatedAt !== expectedUpdatedAt) return res.status(409).json(rejected("Model changed while recording operation progress; refresh its state"));
    // Server-owned chronology lets legacy browser runs without a generation stay
    // historical after a demonstrably newer LOAD; their settlement stays unknown.
    if (data.status === "loading" && data.loadGeneration > record.loadGeneration) record.loadStartedAt = new Date().toISOString();
    if (stageGenerations) {
      if (Object.keys(stageGenerations).length !== record.stages.length || record.stages.some(stage => !stageGenerations[stage.id] || stageGenerations[stage.id]! < stage.nodeGeneration)) return res.status(409).json(rejected("Invalid stage generation receipt"));
      record.stages.forEach(stage => { stage.nodeGeneration = stageGenerations[stage.id]!; });
    }
    Object.assign(record, data, { updatedAt: nextRevision(record.updatedAt) });
    repository.save(record); return res.json(record);
  });
  router.put(deploymentRoutes.reconcile.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    const input = deploymentReconciliationSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    const { expectedUpdatedAt, ...receipt } = input.data;
    if (receipt.loadGeneration !== record.loadGeneration) return res.status(409).json(rejected("Inspection cannot change the current LOAD generation"));
    if (record.updatedAt !== expectedUpdatedAt) return res.status(409).json(rejected("Model changed during inspection; refresh its state again"));
    Object.assign(record, receipt, { updatedAt: nextRevision(record.updatedAt) });
    repository.save(record); return res.json(record);
  });
  for (const route of [deploymentRoutes.load, deploymentRoutes.unload]) {
    router.post(route.path, (_req, res) => res.status(409).json(rejected("P4 load and unload are browser-owned WebSocket operations; this endpoint persists no execution")));
  }
  return router;
}
