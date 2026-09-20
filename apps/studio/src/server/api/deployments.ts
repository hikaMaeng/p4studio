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

const rejected = (message: string): DeploymentErrorResponse => ({ error: { code: "deployment_rejected", message } });

/** Persists declarations and browser-authored receipts; it never runs P4. */
export function createDeploymentRouter(database: StudioDatabase) {
  const router = Router();
  const repository = new DeploymentRepository(database.connection);
  router.get(deploymentRoutes.list.path, (_req, res) => res.json({ deployments: repository.list() } satisfies DeploymentListResponse));
  router.post(deploymentRoutes.create.path, (req, res) => {
    const input = deploymentInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    try { return res.status(201).json(repository.create(input.data)); }
    catch (error) { return res.status(409).json(rejected(String(error))); }
  });
  router.delete(deploymentRoutes.remove.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    // Deleting a declaration does not UNLOAD remote P4 resources. Require an
    // explicit discard marker before dropping a record that still needs recovery.
    if (!canStartDeployment(record) && req.query.discard !== "true") return res.status(409).json(rejected("Unload or reconcile this deployment before deletion; discarding its declaration requires explicit confirmation"));
    if (!repository.remove(record.id)) return res.status(404).json(rejected("Model not found"));
    return res.status(204).end();
  });
  router.put(deploymentRoutes.update.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    if (!canStartDeployment(record)) return res.status(409).json(rejected("Recover or inspect the previous load before editing its placement"));
    const input = deploymentInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    Object.assign(record, input.data, { status: "draft", reports: [], resolvedAddresses: {}, error: "", operationId: "", updatedAt: new Date().toISOString() });
    repository.save(record); return res.json(record);
  });
  router.put(deploymentRoutes.receipt.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    const receipt = deploymentReceiptSchema.safeParse(req.body);
    if (!receipt.success) return res.status(400).json(rejected(receipt.error.message));
    const { stageGenerations, ...data } = receipt.data;
    if (stageGenerations) {
      if (Object.keys(stageGenerations).length !== record.stages.length || record.stages.some(stage => !stageGenerations[stage.id] || stageGenerations[stage.id]! < stage.nodeGeneration)) return res.status(409).json(rejected("Invalid stage generation receipt"));
      record.stages.forEach(stage => { stage.nodeGeneration = stageGenerations[stage.id]!; });
    }
    Object.assign(record, data, { updatedAt: new Date().toISOString() });
    repository.save(record); return res.json(record);
  });
  router.put(deploymentRoutes.reconcile.path, (req, res) => {
    const record = repository.get(String(req.params.id));
    if (!record) return res.status(404).json(rejected("Model not found"));
    const input = deploymentReconciliationSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    const { expectedUpdatedAt, ...receipt } = input.data;
    if (record.updatedAt !== expectedUpdatedAt) return res.status(409).json(rejected("Model changed during inspection; refresh its state again"));
    Object.assign(record, receipt, { updatedAt: new Date().toISOString() });
    repository.save(record); return res.json(record);
  });
  for (const route of [deploymentRoutes.load, deploymentRoutes.unload]) {
    router.post(route.path, (_req, res) => res.status(409).json(rejected("P4 load and unload are browser-owned WebSocket operations; this endpoint persists no execution")));
  }
  return router;
}
