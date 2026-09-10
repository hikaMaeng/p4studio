import type { AgentReachability, P4AgentSnapshot } from "@p4studio/p4-protocol";

export type AgentRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  reachability: AgentReachability;
  latencyMs: number | null;
  lastProbeAt: string | null;
  probeError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentProtocolObservation = {
  state: "pending" | "available" | "error";
  inspectedAt: string | null;
  error: string | null;
  snapshot: P4AgentSnapshot | null;
};

export type AgentViewRecord = AgentRecord & {
  inspection: AgentProtocolObservation;
};

export type NodeRecord = {
  id: string;
  agentId: string;
  name: string;
  adapter: string;
  lifecycle: "declared" | "loading" | "ready" | "error";
  createdAt: string;
};

export type ModelRecord = {
  id: string;
  name: string;
  artifact: string;
  architecture: string;
  adapter: string;
  contextLength: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineStageRecord = {
  id: string;
  pipelineId: string;
  nodeId: string;
  stageIndex: number;
  layerStart: number;
  layerEnd: number;
  launchArgs: string;
};

export type PipelineRecord = {
  id: string;
  name: string;
  modelId: string;
  status: "draft" | "loading" | "ready" | "error";
  createdAt: string;
  updatedAt: string;
  stages: PipelineStageRecord[];
};

export type StudioSnapshot = {
  agents: AgentViewRecord[];
  nodes: NodeRecord[];
  models: ModelRecord[];
  pipelines: PipelineRecord[];
  protocol: {
    frameVersion: number;
    eventVersion: number;
    statusSchemaVersion: number;
  };
  generatedAt: string;
};
