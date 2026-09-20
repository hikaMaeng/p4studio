import { Router } from "express";
import { inferenceRunInputSchema, inferenceRoutes, type InferenceMonitoring } from "@p4studio/studio_domain/common";
import type { StudioDatabase } from "../database/client.js";
import { DeploymentRepository } from "../database/deployments.js";
import type { AgentInspector } from "../agent-socket/inspection/types.js";
import { InferenceController } from "../inference/controller.js";

const error = (message: string) => ({ error: { code: "inference_rejected", message } });

export function createInferenceRouter(database: StudioDatabase, inspector: AgentInspector, probeTimeoutMs: number, controller = new InferenceController()) {
  const router = Router(); const deployments = new DeploymentRepository(database.connection);
  router.get(inferenceRoutes.runs.path, (_request, response) => response.json({ runs: controller.list() }));
  router.post(inferenceRoutes.createRun.path, (request, response) => {
    const input = inferenceRunInputSchema.safeParse(request.body); if (!input.success) return response.status(400).json(error(input.error.message));
    const model = deployments.get(input.data.modelId); if (!model) return response.status(404).json(error("Selected model was not found"));
    try { return response.status(202).json(controller.create(model, input.data)); }
    catch (cause) { return response.status(409).json(error(cause instanceof Error ? cause.message : String(cause))); }
  });
  router.get(inferenceRoutes.runEvents.path, (request, response) => {
    const run = controller.get(String(request.params.id)); if (!run) return response.status(404).json(error("Inference run was not found"));
    response.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); response.flushHeaders();
    const stop = controller.subscribe(run.id, value => response.write(`data: ${JSON.stringify(value)}\n\n`));
    request.on("close", stop);
  });
  router.get(inferenceRoutes.monitoring.path, async (request, response) => {
    const model = deployments.get(String(request.params.id)); if (!model) return response.status(404).json(error("Selected model was not found"));
    const agents = database.agents();
    const nodes = await Promise.all(model.stages.map(async (stage, stageIndex) => {
      const agent = agents.find(value => value.id === stage.agentId);
      if (!agent) return { stageIndex, agentId: stage.agentId, agentName: stage.agentId, nodeId: stage.nodeId, nodeGeneration: stage.nodeGeneration, reachability: "unreachable" as const, observationState: "error" as const, observedAt: null, adapterState: null, gpus: [], delivery: null, latestBatch: null, latestSpan: null, error: "Agent registration was not found" };
      const attempt = await inspector(agent.host, agent.port, probeTimeoutMs);
      const snapshot = attempt.observation.snapshot; const node = snapshot?.nodes.find(value => value.nodeId === stage.nodeId && value.generation === stage.nodeGeneration);
      return { stageIndex, agentId: agent.id, agentName: agent.name, nodeId: stage.nodeId, nodeGeneration: stage.nodeGeneration, reachability: attempt.probe.reachability,
        observationState: attempt.observation.state, observedAt: attempt.observation.inspectedAt, adapterState: node?.state ?? null, delivery: node?.delivery ?? null,
        gpus: (snapshot?.machine.occupancy.gpus ?? []).map((gpu, index) => ({ index, name: snapshot?.machine.capability.gpus.find(value => value.uuid === gpu.uuid)?.name ?? gpu.uuid, vramUsedBytes: gpu.vramUsedBytes, vramFreeBytes: gpu.vramFreeBytes, utilizationGpuPercent: gpu.utilizationGpuPercent, temperatureC: gpu.temperatureC, powerDrawW: gpu.powerDrawW })), latestBatch: controller.batchFor(model.id, model.resolvedAddresses[stage.agentId] ?? "", stage.nodeId), latestSpan: null, error: attempt.observation.error,
      };
    }));
    const payload: InferenceMonitoring = { modelId: model.id, generatedAt: new Date().toISOString(), agents: [], nodes };
    return response.json(payload);
  });
  return { router, controller };
}
