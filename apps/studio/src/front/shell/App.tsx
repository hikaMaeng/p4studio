import { Alert, Box, CircularProgress } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import type { StudioSnapshot } from "../../common/domain.js";
import { RecoveryView } from "../features/agent-recovery/RecoveryView.js";
import { AgentsView } from "../features/agents/AgentsView.js";
import { AgentGroupsView } from "../features/agent-groups/AgentGroupsView.js";
import { AgentDialog } from "../features/agents/AgentDialog.js";
import { DashboardView } from "../features/dashboard/DashboardView.js";
import { ModelHistory } from "../features/models/ModelHistory.js";
import { ModelsView } from "../features/models/ModelsView.js";
import { InferenceView } from "../features/inference/InferenceView.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { studioApi } from "../shared/api/client.js";
import { Navigation, type View } from "./Navigation.js";
import { RSC } from "./resource.js";
import { navigate, useRoute, type StudioRoute } from "./routes.js";

export const App = () => {
  const { t } = useTranslation();
  const route = useRoute();
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { setSnapshot(await studioApi.snapshot()); setError(null); } catch { setError(t[RSC.SHELL_DATA_LOAD_ALERT]); } }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);
  const view: View = route.kind === "overview" ? "overview" : route.kind.startsWith("agent") ? "agents" : route.kind.startsWith("model") ? "models" : route.kind === "inference-history" || route.kind === "inference-history-detail" || route.kind === "inference-history-request-detail" ? "history" : route.kind.startsWith("inference") ? "inference" : "overview";
  const go = (next: StudioRoute) => navigate(next);
  const inferenceRunId = route.kind === "inference-history-detail" || route.kind === "inference-history-request-detail" ? route.runId : undefined;
  const inferenceRequestId = route.kind === "inference-request-detail" || route.kind === "inference-history-request-detail" ? route.requestId : undefined;
  const content = snapshot && (route.kind === "model-history" ? <ModelHistory modelId={route.modelId} /> : route.kind === "agent-recovery" ? <RecoveryView agentId={route.agentId} operationId={route.operationId} /> : route.kind === "overview" ? <DashboardView snapshot={snapshot} onRegister={() => go({ kind: "agent-new" })} onRefresh={() => void refresh()} /> : route.kind === "agent-groups" || route.kind === "agent-group-new" || route.kind === "agent-group-detail" || route.kind === "agent-group-edit" ? <AgentGroupsView groupId={route.kind === "agent-group-detail" || route.kind === "agent-group-edit" ? route.groupId : undefined} editor={route.kind === "agent-group-new" || route.kind === "agent-group-edit"} /> : view === "agents" ? <AgentsView snapshot={snapshot} selectedAgentId={route.kind === "agent-detail" || route.kind === "agent-node-new" ? route.agentId : undefined} selectedTab={route.kind === "agent-detail" ? route.tab : "nodes"} nodeCreation={route.kind === "agent-node-new"} onChanged={refresh} onRegister={() => go({ kind: "agent-new" })} onOpenAgent={(agentId) => go({ kind: "agent-detail", agentId, tab: "information" })} onBack={() => go({ kind: "agents" })} onSelectTab={(tab) => { if (route.kind === "agent-detail") go({ kind: "agent-detail", agentId: route.agentId, tab }); }} onDeclareNode={(agentId) => go({ kind: "agent-node-new", agentId })} onCloseNodeCreation={() => { if (route.kind === "agent-node-new") go({ kind: "agent-detail", agentId: route.agentId, tab: "nodes" }); }} /> : view === "models" ? <ModelsView snapshot={snapshot} selectedModelId={route.kind === "model-detail" || route.kind === "model-edit" ? route.modelId : undefined} editor={route.kind === "model-new" ? "new" : route.kind === "model-edit" ? "edit" : undefined} onOpenModel={(modelId) => go({ kind: "model-detail", modelId })} onCreate={() => go({ kind: "model-new" })} onEdit={(modelId) => go({ kind: "model-edit", modelId })} onCloseEditor={() => go(route.kind === "model-edit" ? { kind: "model-detail", modelId: route.modelId } : { kind: "models" })} onSaved={(modelId) => go({ kind: "model-detail", modelId })} /> : view === "inference" || view === "history" ? <InferenceView history={view === "history"} historyRunId={inferenceRunId} requestId={inferenceRequestId} onOpenHistory={(runId) => go({ kind: "inference-history-detail", runId })} onBackHistory={() => go({ kind: "inference-history" })} onOpenRequest={(requestId) => go({ kind: "inference-request-detail", requestId })} onOpenHistoryRequest={(requestId, runId) => go({ kind: "inference-history-request-detail", runId, requestId })} onBackRequest={(fromHistory, runId) => go(fromHistory ? runId ? { kind: "inference-history-detail", runId } : { kind: "inference-history" } : { kind: "inference" })} /> : null);
  return <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
    <Navigation current={view} onChange={(next) => go(next === "overview" ? { kind: "overview" } : next === "inference" ? { kind: "inference" } : next === "history" ? { kind: "inference-history" } : { kind: next })} />
    <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: "auto", px: { xs: 2, md: 3.5 }, pt: { xs: 1, md: 1.75 }, pb: { xs: 2, md: 3.5 } }}><Box sx={{ maxWidth: 1440, mx: "auto" }}>{error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}{!snapshot && !error ? <Box role="status" sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress size={24} /></Box> : content}</Box></Box>
    </Box>
    <AgentDialog open={route.kind === "agent-new"} onClose={() => go({ kind: "agents" })} onCreated={async (agentId) => { await refresh(); go({ kind: "agent-detail", agentId, tab: "information" }); }} />
  </Box>;
};
