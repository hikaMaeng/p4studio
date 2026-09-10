import { Box, ButtonBase, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import type { AgentRecord, AgentViewRecord, StudioSnapshot } from "../../../common/domain.js";
import { formatBytes, formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { studioApi } from "../../shared/api/client.js";
import { EmptyState } from "../../shared/components/EmptyState.js";
import { Icon } from "../../shared/components/Icon.js";
import { RSC as COMMON_RSC } from "../../shared/components/resource.js";
import { StatusPill } from "../../shared/components/StatusPill.js";
import { AgentDetailView } from "./AgentDetailView.js";
import { NodeDialog } from "./NodeDialog.js";
import { RSC } from "./resource.js";

const gpuSummary = (agent: AgentViewRecord, missing: string, empty: string) => {
  const gpus = agent.inspection.snapshot?.machine.capability.gpus;
  if (!gpus) return missing;
  if (gpus.length === 0) return empty;
  return gpus.map((gpu) => gpu.name.replace("NVIDIA GeForce ", "")).join(" · ");
};

export const AgentsView = ({ snapshot, onChanged, onRegister }: { snapshot: StudioSnapshot; onChanged: () => Promise<void>; onRegister: () => void }) => {
  const { language, t } = useTranslation();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null); const [nodeAgent, setNodeAgent] = useState<AgentRecord | null>(null); const [probing, setProbing] = useState<string | null>(null);
  const selectedAgent = snapshot.agents.find((agent) => agent.id === selectedAgentId);
  if (snapshot.agents.length === 0) return <EmptyState title={t[RSC.AGENTS_EMPTY_TITLE_TEXT]} detail={t[RSC.AGENTS_EMPTY_DETAIL_MESSAGE]} action={t[RSC.AGENTS_REGISTER_BUTTON]} onAction={onRegister} />;
  if (selectedAgent) return <><AgentDetailView agent={selectedAgent} declaredNodes={snapshot.nodes.filter((node) => node.agentId === selectedAgent.id)} onBack={() => setSelectedAgentId(null)} onChanged={onChanged} onDeclareNode={() => setNodeAgent(selectedAgent)} /><NodeDialog agent={nodeAgent} onClose={() => setNodeAgent(null)} onCreated={async () => { setNodeAgent(null); await onChanged(); }} /></>;
  return <><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1.5 }}><Typography component="h2" variant="subtitle1">{t[RSC.AGENTS_LIST_TITLE_TEXT]}</Typography><Typography variant="caption" color="text.secondary">{formatMessage(t[RSC.AGENTS_LIST_COUNT_TEXT], { count: snapshot.agents.length })}</Typography></Box>
    <Box component="ul" aria-label={t[RSC.AGENTS_LIST_LABEL]} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>{snapshot.agents.map((agent) => { const p4Snapshot = agent.inspection.snapshot; const machine = p4Snapshot?.machine; const gpu = gpuSummary(agent, t[RSC.AGENTS_NOT_INSPECTED_TEXT], t[RSC.AGENTS_NO_GPU_TEXT]); return <Paper data-testid="agent-row" component="li" key={agent.id} variant="outlined" sx={{ bgcolor: "background.paper", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "stretch", overflow: "hidden" }}><ButtonBase aria-label={formatMessage(t[RSC.AGENTS_DETAIL_BUTTON], { name: agent.name })} onClick={() => setSelectedAgentId(agent.id)} sx={{ minWidth: 0, display: "block", textAlign: "start", px: { xs: 1.5, md: 2 }, py: 1.5, borderRadius: 0 }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "minmax(220px, 1.7fr) minmax(180px, 1.3fr) minmax(150px, 1fr) 80px 80px auto" }, gap: { xs: 1, md: 2 }, alignItems: "center" }}><Box sx={{ minWidth: 0 }}><Typography component="h3" variant="body1" sx={{ fontWeight: 650 }}>{agent.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>{agent.host}:{agent.port}</Typography></Box><Box sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}><Typography variant="caption" color="text.secondary">{t[RSC.AGENTS_GPU_TEXT]}</Typography><Typography variant="body2" noWrap title={gpu}>{gpu}</Typography></Box><Box sx={{ minWidth: 0, display: { xs: "none", md: "block" } }}><Typography variant="caption" color="text.secondary">{t[RSC.AGENTS_RAM_TEXT]}</Typography><Typography variant="body2" noWrap>{formatBytes(machine?.occupancy.memory.usedBytes ?? null, language, t[COMMON_RSC.COMMON_VALUE_UNAVAILABLE_TEXT])} / {formatBytes(machine?.capability.memory.totalBytes ?? null, language, t[COMMON_RSC.COMMON_VALUE_UNAVAILABLE_TEXT])}</Typography></Box><Box sx={{ display: { xs: "none", md: "block" } }}><Typography variant="caption" color="text.secondary">{t[RSC.AGENTS_P4_NODES_TEXT]}</Typography><Typography variant="body2">{p4Snapshot?.nodes.length ?? t[COMMON_RSC.COMMON_VALUE_UNAVAILABLE_TEXT]}</Typography></Box><Box sx={{ display: { xs: "none", md: "block" } }}><Typography variant="caption" color="text.secondary">{t[RSC.AGENTS_LATENCY_TEXT]}</Typography><Typography variant="body2">{agent.latencyMs == null ? t[COMMON_RSC.COMMON_VALUE_UNAVAILABLE_TEXT] : `${agent.latencyMs} ms`}</Typography></Box><Box sx={{ display: "flex", alignItems: "center", gap: 1 }}><StatusPill value={agent.reachability} /><Icon className="directional-icon" name="arrow" fontSize="small" sx={{ color: "text.secondary" }} /></Box></Box></ButtonBase><Tooltip title={t[RSC.AGENTS_INSPECT_BUTTON]}><span><IconButton aria-label={formatMessage(t[RSC.AGENTS_INSPECT_BUTTON], { name: agent.name })} size="small" disabled={probing === agent.id} onClick={async () => { setProbing(agent.id); try { await studioApi.inspectAgent(agent.id); await onChanged(); } finally { setProbing(null); } }} sx={{ alignSelf: "center", marginInlineEnd: 1 }}><Icon name="refresh" fontSize="small" /></IconButton></span></Tooltip></Paper>; })}</Box>
  </>;
};
