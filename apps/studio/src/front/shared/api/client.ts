import type { AgentViewRecord, ModelRecord, PipelineRecord, StudioSnapshot } from "../../../common/domain.js";
import { graphInventoryRoutes, type AgentRemovalResult } from "@p4studio/studio_domain/common";

type ErrorPayload = { error?: { message?: string } };

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ErrorPayload;
    throw new Error(payload.error?.message ?? `요청 실패 (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const studioApi = {
  deleteAgent: async (agentId: string): Promise<AgentRemovalResult> => {
    const route = graphInventoryRoutes.removeAgent;
    const response = await fetch(route.path.replace(":id", encodeURIComponent(agentId)), { method: route.method });
    if (response.status === 204) return "deleted";
    if (response.status === 404) return "missing";
    if (response.status === 409) return "in_use";
    throw new Error(`HTTP ${response.status}`);
  },
  snapshot: () => request<StudioSnapshot>("/api/snapshot"),
  createAgent: (value: { name: string; host: string; port: number }) => request<AgentViewRecord>("/api/agents", { method: "POST", body: JSON.stringify(value) }),
  updateAgent: (agentId: string, value: { name: string; host: string; port: number }) => request<AgentViewRecord>(`/api/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(value) }),
  createNode: (agentId: string, value: { name: string }) => request(`/api/agents/${agentId}/nodes`, { method: "POST", body: JSON.stringify(value) }),
  createModel: (value: Omit<ModelRecord, "id" | "createdAt" | "updatedAt">) => request<ModelRecord>("/api/models", { method: "POST", body: JSON.stringify(value) }),
  createPipeline: (value: { name: string; modelId: string; stages: Array<{ nodeId: string; stageIndex: number; layerStart: number; layerEnd: number; launchArgs: string }> }) => request<PipelineRecord>("/api/pipelines", { method: "POST", body: JSON.stringify(value) }),
};
