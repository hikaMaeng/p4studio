import { useSyncExternalStore } from "react";

export type AgentTab = "information" | "nodes";
export type InferenceTab = "query" | "monitoring" | "history";
export type StudioRoute =
  | { kind: "overview" }
  | { kind: "agents" }
  | { kind: "agent-new" }
  | { kind: "agent-groups" }
  | { kind: "agent-group-new" }
  | { kind: "agent-group-detail"; groupId: string }
  | { kind: "agent-group-edit"; groupId: string }
  | { kind: "agent-detail"; agentId: string; tab: AgentTab }
  | { kind: "agent-node-new"; agentId: string }
  | { kind: "models" }
  | { kind: "model-new" }
  | { kind: "model-detail"; modelId: string }
  | { kind: "model-edit"; modelId: string }
  | { kind: "pipelines" }
  | { kind: "pipeline-new" }
  | { kind: "pipeline-detail"; pipelineId: string }
  | { kind: "inference"; tab: InferenceTab }
  | { kind: "inference-history-detail"; runId: string }
  | { kind: "inference-request-detail"; requestId: string };

const decode = (value: string) => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export const parseRoute = (pathname: string): StudioRoute => {
  const segments = pathname.split("/").filter(Boolean).map(decode);
  if (segments.length === 0) return { kind: "overview" };
  if (segments[0] === "agent-groups") {
    if (segments.length === 1) return { kind: "agent-groups" };
    if (segments.length === 2 && segments[1] === "new") return { kind: "agent-group-new" };
    if (segments.length === 2) return { kind: "agent-group-detail", groupId: segments[1]! };
    if (segments.length === 3 && segments[2] === "edit") return { kind: "agent-group-edit", groupId: segments[1]! };
    return { kind: "agent-group-detail", groupId: "" };
  }
  if (segments.length === 1 && segments[0] === "agents") return { kind: "agents" };
  if (segments[0] === "agents" && segments[1] === "new" && segments.length === 2) return { kind: "agent-new" };
  if (segments[0] === "agents" && segments.length >= 2) {
    const agentId = segments[1]!;
    if (segments[2] === "nodes" && segments[3] === "new" && segments.length === 4) return { kind: "agent-node-new", agentId };
    if (segments[2] === "nodes" && segments.length === 3) return { kind: "agent-detail", agentId, tab: "nodes" };
    if ((segments[2] === "information" || segments.length === 2) && segments.length <= 3) return { kind: "agent-detail", agentId, tab: "information" };
  }
  if (segments.length === 1 && segments[0] === "models") return { kind: "models" };
  if (segments[0] === "models" && segments[1] === "new" && segments.length === 2) return { kind: "model-new" };
  if (segments[0] === "models" && segments.length === 2) return { kind: "model-detail", modelId: segments[1]! };
  if (segments[0] === "models" && segments[2] === "edit" && segments.length === 3) return { kind: "model-edit", modelId: segments[1]! };
  if (segments.length === 1 && segments[0] === "pipelines") return { kind: "pipelines" };
  if (segments[0] === "pipelines" && segments[1] === "new" && segments.length === 2) return { kind: "pipeline-new" };
  if (segments[0] === "pipelines" && segments.length === 2) return { kind: "pipeline-detail", pipelineId: segments[1]! };
  if (segments.length === 1 && segments[0] === "inference") return { kind: "inference", tab: "query" };
  if (segments[0] === "inference" && segments[1] === "requests" && segments.length === 3) return { kind: "inference-request-detail", requestId: segments[2]! };
  if (segments[0] === "inference" && segments[1] === "history" && segments.length === 3) return { kind: "inference-history-detail", runId: segments[2]! };
  if (segments[0] === "inference" && (["query", "monitoring", "history"] as const).includes(segments[1] as InferenceTab) && segments.length === 2) return { kind: "inference", tab: segments[1] as InferenceTab };
  return { kind: "overview" };
};

export const routePath = (route: StudioRoute) => {
  switch (route.kind) {
    case "overview": return "/";
    case "agents": return "/agents";
    case "agent-new": return "/agents/new";
    case "agent-groups": return "/agent-groups";
    case "agent-group-new": return "/agent-groups/new";
    case "agent-group-detail": return `/agent-groups/${encodeURIComponent(route.groupId)}`;
    case "agent-group-edit": return `/agent-groups/${encodeURIComponent(route.groupId)}/edit`;
    case "agent-detail": return `/agents/${encodeURIComponent(route.agentId)}/${route.tab}`;
    case "agent-node-new": return `/agents/${encodeURIComponent(route.agentId)}/nodes/new`;
    case "models": return "/models";
    case "model-new": return "/models/new";
    case "model-detail": return `/models/${encodeURIComponent(route.modelId)}`;
    case "model-edit": return `/models/${encodeURIComponent(route.modelId)}/edit`;
    case "pipelines": return "/pipelines";
    case "pipeline-new": return "/pipelines/new";
    case "pipeline-detail": return `/pipelines/${encodeURIComponent(route.pipelineId)}`;
    case "inference": return `/inference/${route.tab}`;
    case "inference-history-detail": return `/inference/history/${encodeURIComponent(route.runId)}`;
    case "inference-request-detail": return `/inference/requests/${encodeURIComponent(route.requestId)}`;
  }
};

const LOCATION_CHANGE = "p4studio:location-change";
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener(LOCATION_CHANGE, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(LOCATION_CHANGE, listener); };
};
const getSnapshot = () => window.location.pathname;

export const useRoute = () => parseRoute(useSyncExternalStore(subscribe, getSnapshot, () => "/"));

export const navigate = (route: StudioRoute, options?: { replace?: boolean }) => {
  const path = routePath(route);
  if (window.location.pathname === path) return;
  window.history[options?.replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new Event(LOCATION_CHANGE));
};
