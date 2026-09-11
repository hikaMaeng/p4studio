import { Alert, Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import type { StudioSnapshot } from "../../common/domain.js";
import { AgentsView } from "../features/agents/AgentsView.js";
import { AgentDialog } from "../features/agents/AgentDialog.js";
import { DashboardView } from "../features/dashboard/DashboardView.js";
import { ModelsView } from "../features/models/ModelsView.js";
import { InferenceView } from "../features/inference/InferenceView.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { studioApi } from "../shared/api/client.js";
import { Icon } from "../shared/components/Icon.js";
import { Navigation, type View } from "./Navigation.js";
import { RSC } from "./resource.js";
import { navigate, useRoute, type StudioRoute } from "./routes.js";

const titleKeys: Record<Exclude<View, "inference">, RSC> = { overview: RSC.SHELL_NAVIGATION_OVERVIEW_BUTTON, agents: RSC.SHELL_NAVIGATION_AGENTS_BUTTON, models: RSC.SHELL_NAVIGATION_MODELS_BUTTON };
const descriptionKeys: Record<Exclude<View, "inference">, RSC> = { overview: RSC.SHELL_PAGE_OVERVIEW_DESCRIPTION_MESSAGE, agents: RSC.SHELL_PAGE_AGENTS_DESCRIPTION_MESSAGE, models: RSC.SHELL_PAGE_MODELS_DESCRIPTION_MESSAGE };
const actionKeys: Record<Exclude<View, "inference">, RSC> = { overview: RSC.SHELL_ACTION_REGISTER_AGENT_BUTTON, agents: RSC.SHELL_ACTION_REGISTER_AGENT_BUTTON, models: RSC.SHELL_ACTION_REGISTER_MODEL_BUTTON };

export const App = () => {
  const { t } = useTranslation();
  const route = useRoute();
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { setSnapshot(await studioApi.snapshot()); setError(null); } catch { setError(t[RSC.SHELL_DATA_LOAD_ALERT]); } }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);
  const view: View = route.kind === "overview" ? "overview" : route.kind.startsWith("agent") ? "agents" : route.kind.startsWith("model") ? "models" : route.kind === "inference" ? "inference" : "overview";
  const go = (next: StudioRoute) => navigate(next);
  const openPrimary = () => go(view === "models" ? { kind: "model-new" } : { kind: "agent-new" });
  const content = snapshot && (route.kind === "overview" ? <DashboardView snapshot={snapshot} onRegister={() => go({ kind: "agent-new" })} /> : view === "agents" ? <AgentsView snapshot={snapshot} selectedAgentId={route.kind === "agent-detail" || route.kind === "agent-node-new" ? route.agentId : undefined} selectedTab={route.kind === "agent-detail" ? route.tab : "nodes"} nodeCreation={route.kind === "agent-node-new"} onChanged={refresh} onRegister={() => go({ kind: "agent-new" })} onOpenAgent={(agentId) => go({ kind: "agent-detail", agentId, tab: "information" })} onBack={() => go({ kind: "agents" })} onSelectTab={(tab) => { if (route.kind === "agent-detail") go({ kind: "agent-detail", agentId: route.agentId, tab }); }} onDeclareNode={(agentId) => go({ kind: "agent-node-new", agentId })} onCloseNodeCreation={() => { if (route.kind === "agent-node-new") go({ kind: "agent-detail", agentId: route.agentId, tab: "nodes" }); }} /> : view === "models" ? <ModelsView snapshot={snapshot} selectedModelId={route.kind === "model-detail" || route.kind === "model-edit" ? route.modelId : undefined} editor={route.kind === "model-new" ? "new" : route.kind === "model-edit" ? "edit" : undefined} onOpenModel={(modelId) => go({ kind: "model-detail", modelId })} onCreate={() => go({ kind: "model-new" })} onEdit={(modelId) => go({ kind: "model-edit", modelId })} onCloseEditor={() => go(route.kind === "model-edit" ? { kind: "model-detail", modelId: route.modelId } : { kind: "models" })} onSaved={(modelId) => go({ kind: "model-detail", modelId })} /> : route.kind === "inference" ? <InferenceView tab={route.tab} onTab={(tab) => go({ kind: "inference", tab })} /> : null);
  const compactAgents = view === "agents" || view === "models" || view === "inference";
  return <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
    <Navigation current={view} onChange={(next) => go(next === "overview" ? { kind: "overview" } : next === "inference" ? { kind: "inference", tab: "query" } : { kind: next })} />
    <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {!compactAgents && <Box component="header" sx={{ height: 68, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3.5 }, flexShrink: 0 }}><Typography variant="caption" color="text.secondary">{t[RSC.SHELL_BRAND_MARK_TEXT]} / {t[titleKeys[view]]}</Typography><Box sx={{ display: "flex", gap: 1 }}><IconButton aria-label={t[RSC.SHELL_ACTION_REFRESH_BUTTON]} onClick={() => void refresh()} size="small"><Icon name="refresh" fontSize="small" /></IconButton><Button variant="contained" size="small" startIcon={<Icon name="add" fontSize="small" />} onClick={openPrimary}>{t[actionKeys[view]]}</Button></Box></Box>}
      <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: "auto", p: compactAgents ? { xs: 2, md: 3.5 } : { xs: 2, md: 3.5, lg: 5 } }}><Box sx={{ maxWidth: 1440, mx: "auto" }}>{!compactAgents && <Box sx={{ mb: 4 }}><Typography variant="h1">{t[titleKeys[view]]}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{t[descriptionKeys[view]]}</Typography></Box>}{error && <Alert severity="error" role="alert" sx={{ mb: 3 }}>{error}</Alert>}{!snapshot && !error ? <Box role="status" sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress size={24} /></Box> : content}</Box></Box>
    </Box>
    <AgentDialog open={route.kind === "agent-new"} onClose={() => go({ kind: "agents" })} onCreated={async (agentId) => { await refresh(); go({ kind: "agent-detail", agentId, tab: "information" }); }} />
  </Box>;
};
