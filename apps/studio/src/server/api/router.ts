import { Router } from "express";
import { P4_PROTOCOL } from "@p4studio/p4-protocol";
import type { StudioDatabase } from "../database/client.js";
import type { AgentObservationStore } from "../agent-socket/inspection/store.js";
import { agentInput, modelInput, nodeInput, pipelineInput } from "./validation.js";
import { graphInventoryRoutes, graphNameSchema, nodeLabelInputSchema, type GraphAgent, type NodeLabelList } from "@p4studio/studio_domain/common";

const apiError = (code: string, message: string, issues?: unknown) => ({ error: { code, message, ...(issues ? { issues } : {}) } });

export const createApiRouter = (
  database: StudioDatabase,
  observations: AgentObservationStore,
) => {
  const router = Router();

  router.get(graphInventoryRoutes.labels.path.slice(4), (_request, response) => response.json({ labels: database.nodeLabels() } satisfies NodeLabelList));
  router.patch<{ id: string }>(graphInventoryRoutes.renameAgent.path.slice(4), (request, response) => {
    if (!database.agent(request.params.id)) return response.status(404).json(apiError("agent_not_found", "Agent not found"));
    const parsed = graphNameSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_name", "Invalid name"));
    try { return response.json(database.renameAgent(request.params.id, parsed.data.name)! satisfies GraphAgent); }
    catch { return response.status(409).json(apiError("agent_conflict", "Agent name already exists")); }
  });
  router.put<{ id: string }>(graphInventoryRoutes.renameNode.path.slice(4), (request, response) => {
    if (!database.agent(request.params.id)) return response.status(404).json(apiError("agent_not_found", "Agent not found"));
    const parsed = nodeLabelInputSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_name", "Invalid node name"));
    return response.json(database.renameNode(request.params.id, parsed.data));
  });

  router.get("/snapshot", (_request, response) => response.json({
    agents: database.agents().map((agent) => observations.view(agent)), nodes: database.nodes(), models: database.models(), pipelines: database.pipelines(),
    protocol: P4_PROTOCOL, generatedAt: new Date().toISOString(),
  }));

  router.post("/agents", (request, response) => {
    const parsed = agentInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_agent", "에이전트 입력을 확인하세요.", parsed.error.issues));
    let agent;
    try { agent = database.createAgent(parsed.data); }
    catch { return response.status(409).json(apiError("agent_conflict", "같은 이름 또는 주소의 에이전트가 이미 있습니다.")); }
    return response.status(201).json(observations.view(agent));
  });

  router.patch("/agents/:id", (request, response) => {
    if (!database.agent(request.params.id)) return response.status(404).json(apiError("agent_not_found", "에이전트를 찾을 수 없습니다."));
    const parsed = agentInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_agent", "에이전트 입력을 확인하세요.", parsed.error.issues));
    let agent;
    try { agent = database.updateAgent(request.params.id, parsed.data); }
    catch { return response.status(409).json(apiError("agent_conflict", "같은 이름 또는 주소의 에이전트가 이미 있습니다.")); }
    if (!agent) return response.status(404).json(apiError("agent_not_found", "에이전트를 찾을 수 없습니다."));
    return response.json(observations.view(agent));
  });

  router.post("/agents/:id/probe", (request, response) => {
    const agent = database.agent(request.params.id);
    if (!agent) return response.status(404).json(apiError("agent_not_found", "에이전트를 찾을 수 없습니다."));
    return response.status(409).json(apiError("browser_owned_transport", "P4 관측은 브라우저 WebSocket 세션에서 실행됩니다."));
  });

  router.post("/agents/:id/nodes", (request, response) => {
    const agent = database.agent(request.params.id);
    if (!agent) return response.status(404).json(apiError("agent_not_found", "에이전트를 찾을 수 없습니다."));
    const parsed = nodeInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_node", "노드 입력을 확인하세요.", parsed.error.issues));
    try { return response.status(201).json(database.createNode({ agentId: agent.id, ...parsed.data })); }
    catch { return response.status(409).json(apiError("node_conflict", "같은 이름의 노드가 이미 있습니다.")); }
  });

  router.delete("/agents/:id", (request, response) => {
    try {
      if (!database.deleteAgent(request.params.id)) return response.status(404).json(apiError("agent_not_found", "에이전트를 찾을 수 없습니다."));
      observations.delete(request.params.id);
      return response.status(204).end();
    } catch {
      return response.status(409).json(apiError("agent_in_use", "노드가 연결된 에이전트는 삭제할 수 없습니다."));
    }
  });

  router.post("/models", (request, response) => {
    const parsed = modelInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_model", "모델 입력을 확인하세요.", parsed.error.issues));
    try { return response.status(201).json(database.createModel(parsed.data)); }
    catch { return response.status(409).json(apiError("model_conflict", "같은 이름의 모델이 이미 있습니다.")); }
  });

  router.post("/pipelines", (request, response) => {
    const parsed = pipelineInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(apiError("invalid_pipeline", "파이프라인 입력을 확인하세요.", parsed.error.issues));
    try { return response.status(201).json(database.createPipeline(parsed.data)); }
    catch { return response.status(409).json(apiError("pipeline_conflict", "파이프라인 관계 또는 이름이 충돌합니다.")); }
  });

  return router;
};
