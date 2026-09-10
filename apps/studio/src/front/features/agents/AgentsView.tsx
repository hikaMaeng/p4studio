import { Box, Button, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import type { AgentRecord, StudioSnapshot } from "../../../common/domain.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { EmptyState } from "../../shared/components/EmptyState.js";
import { Icon } from "../../shared/components/Icon.js";
import { RSC as SHELL_RSC } from "../../shell/resource.js";
import { AgentDetailView } from "./AgentDetailView.js";
import { AgentRow } from "./AgentRow.js";
import { NodeDialog } from "./NodeDialog.js";
import { RSC } from "./resource.js";

export const AgentsView = ({ snapshot, onChanged, onRegister }: { snapshot: StudioSnapshot; onChanged: () => Promise<void>; onRegister: () => void }) => {
  const { t } = useTranslation();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null); const [nodeAgent, setNodeAgent] = useState<AgentRecord | null>(null);
  const selectedAgent = snapshot.agents.find((agent) => agent.id === selectedAgentId);
  if (snapshot.agents.length === 0) return <EmptyState title={t[RSC.AGENTS_EMPTY_TITLE_TEXT]} detail={t[RSC.AGENTS_EMPTY_DETAIL_MESSAGE]} action={t[RSC.AGENTS_REGISTER_BUTTON]} onAction={onRegister} />;
  if (selectedAgent) return <><AgentDetailView agent={selectedAgent} declaredNodes={snapshot.nodes.filter((node) => node.agentId === selectedAgent.id)} onBack={() => setSelectedAgentId(null)} onChanged={onChanged} onDeclareNode={() => setNodeAgent(selectedAgent)} /><NodeDialog agent={nodeAgent} onClose={() => setNodeAgent(null)} onCreated={async () => { setNodeAgent(null); await onChanged(); }} /></>;
  return <><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, mb: 1.5 }}><Box sx={{ display: "flex", alignItems: "baseline", gap: 1.25, minWidth: 0 }}><Typography component="h1" variant="subtitle1">{t[RSC.AGENTS_LIST_TITLE_TEXT]}</Typography><Typography variant="caption" color="text.secondary" noWrap>{formatMessage(t[RSC.AGENTS_LIST_COUNT_TEXT], { count: snapshot.agents.length })}</Typography></Box><Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}><IconButton aria-label={t[SHELL_RSC.SHELL_ACTION_REFRESH_BUTTON]} onClick={() => void onChanged()} size="small"><Icon name="refresh" fontSize="small" /></IconButton><Button variant="contained" size="small" startIcon={<Icon name="add" fontSize="small" />} onClick={onRegister}>{t[RSC.AGENTS_REGISTER_BUTTON]}</Button></Box></Box>
    <Box component="ul" aria-label={t[RSC.AGENTS_LIST_LABEL]} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>{snapshot.agents.map((agent) => <AgentRow key={agent.id} agent={agent} onChanged={onChanged} onOpen={() => setSelectedAgentId(agent.id)} />)}</Box>
  </>;
};
