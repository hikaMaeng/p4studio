import { Alert, Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import type { StudioSnapshot } from "../../common/domain.js";
import { AgentsView } from "../features/agents/AgentsView.js";
import { AgentDialog } from "../features/agents/AgentDialog.js";
import { DashboardView } from "../features/dashboard/DashboardView.js";
import { ModelDialog } from "../features/models/ModelDialog.js";
import { ModelsView } from "../features/models/ModelsView.js";
import { PipelineDialog } from "../features/pipelines/PipelineDialog.js";
import { PipelinesView } from "../features/pipelines/PipelinesView.js";
import { useTranslation } from "../i18n/useTranslation.js";
import { studioApi } from "../shared/api/client.js";
import { Icon } from "../shared/components/Icon.js";
import { Navigation, type View } from "./Navigation.js";
import { RSC } from "./resource.js";

const titleKeys: Record<View, RSC> = { overview: RSC.SHELL_NAVIGATION_OVERVIEW_BUTTON, agents: RSC.SHELL_NAVIGATION_AGENTS_BUTTON, models: RSC.SHELL_NAVIGATION_MODELS_BUTTON, pipelines: RSC.SHELL_NAVIGATION_PIPELINES_BUTTON };
const descriptionKeys: Record<View, RSC> = { overview: RSC.SHELL_PAGE_OVERVIEW_DESCRIPTION_MESSAGE, agents: RSC.SHELL_PAGE_AGENTS_DESCRIPTION_MESSAGE, models: RSC.SHELL_PAGE_MODELS_DESCRIPTION_MESSAGE, pipelines: RSC.SHELL_PAGE_PIPELINES_DESCRIPTION_MESSAGE };
const actionKeys: Record<View, RSC> = { overview: RSC.SHELL_ACTION_REGISTER_AGENT_BUTTON, agents: RSC.SHELL_ACTION_REGISTER_AGENT_BUTTON, models: RSC.SHELL_ACTION_REGISTER_MODEL_BUTTON, pipelines: RSC.SHELL_ACTION_CREATE_PIPELINE_BUTTON };

export const App = () => {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("overview");
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"agent" | "model" | "pipeline" | null>(null);
  const refresh = useCallback(async () => { try { setSnapshot(await studioApi.snapshot()); setError(null); } catch { setError(t[RSC.SHELL_DATA_LOAD_ALERT]); } }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);
  const openPrimary = () => setDialog(view === "models" ? "model" : view === "pipelines" ? "pipeline" : "agent");
  const content = snapshot && (view === "overview" ? <DashboardView snapshot={snapshot} onRegister={() => setDialog("agent")} /> : view === "agents" ? <AgentsView snapshot={snapshot} onChanged={refresh} onRegister={() => setDialog("agent")} /> : view === "models" ? <ModelsView models={snapshot.models} onRegister={() => setDialog("model")} /> : <PipelinesView snapshot={snapshot} onCreate={() => setDialog("pipeline")} />);
  const compactAgents = view === "agents";
  return <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
    <Navigation current={view} onChange={setView} />
    <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {!compactAgents && <Box component="header" sx={{ height: 68, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3.5 }, flexShrink: 0 }}><Typography variant="caption" color="text.secondary">{t[RSC.SHELL_BRAND_MARK_TEXT]} / {t[titleKeys[view]]}</Typography><Box sx={{ display: "flex", gap: 1 }}><IconButton aria-label={t[RSC.SHELL_ACTION_REFRESH_BUTTON]} onClick={() => void refresh()} size="small"><Icon name="refresh" fontSize="small" /></IconButton><Button variant="contained" size="small" startIcon={<Icon name="add" fontSize="small" />} onClick={openPrimary}>{t[actionKeys[view]]}</Button></Box></Box>}
      <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: "auto", p: compactAgents ? { xs: 2, md: 3.5 } : { xs: 2, md: 3.5, lg: 5 } }}><Box sx={{ maxWidth: 1440, mx: "auto" }}>{!compactAgents && <Box sx={{ mb: 4 }}><Typography variant="h1">{t[titleKeys[view]]}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{t[descriptionKeys[view]]}</Typography></Box>}{error && <Alert severity="error" role="alert" sx={{ mb: 3 }}>{error}</Alert>}{!snapshot && !error ? <Box role="status" sx={{ minHeight: 300, display: "grid", placeItems: "center" }}><CircularProgress size={24} /></Box> : content}</Box></Box>
    </Box>
    <AgentDialog open={dialog === "agent"} onClose={() => setDialog(null)} onCreated={async () => { setDialog(null); await refresh(); }} />
    <ModelDialog open={dialog === "model"} onClose={() => setDialog(null)} onCreated={async () => { setDialog(null); await refresh(); }} />
    {snapshot && <PipelineDialog open={dialog === "pipeline"} snapshot={snapshot} onClose={() => setDialog(null)} onCreated={async () => { setDialog(null); await refresh(); }} />}
  </Box>;
};
