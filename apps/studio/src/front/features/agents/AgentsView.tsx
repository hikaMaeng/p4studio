import { Box, Button, Typography } from "@mui/material";
import type { StudioSnapshot } from "../../../common/domain.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { EmptyState } from "../../shared/components/EmptyState.js";
import { Icon } from "../../shared/components/Icon.js";
import { useGraphInventory } from "../../p4/inventory.js";
import { AgentDetailView } from "./AgentDetailView.js";
import { AgentRow } from "./AgentRow.js";
import { NodeDialog } from "./NodeDialog.js";
import { RSC } from "./resource.js";

export const AgentsView = ({ snapshot, selectedAgentId, selectedTab, nodeCreation, onChanged, onRegister, onOpenAgent, onBack, onSelectTab, onDeclareNode, onCloseNodeCreation }: { snapshot: StudioSnapshot; selectedAgentId?: string; selectedTab?: "information" | "nodes"; nodeCreation?: boolean; onChanged: () => Promise<void>; onRegister: () => void; onOpenAgent: (agentId: string) => void; onBack: () => void; onSelectTab: (tab: "information" | "nodes") => void; onDeclareNode: (agentId: string) => void; onCloseNodeCreation: () => void }) => {
  const { t } = useTranslation();
  const inventory = useGraphInventory(snapshot);
  const selectedAgent = inventory.agents.find((agent) => agent.id === selectedAgentId);
  if (inventory.agents.length === 0) return <EmptyState title={t[RSC.AGENTS_EMPTY_TITLE_TEXT]} detail={t[RSC.AGENTS_EMPTY_DETAIL_MESSAGE]} action={t[RSC.AGENTS_REGISTER_BUTTON]} onAction={onRegister} />;
  if (selectedAgent) return <><Box sx={{ mt: { xs: -1.375, md: -2.875 } }}><AgentDetailView agent={selectedAgent} declaredNodes={inventory.nodes.filter((node) => node.agentId === selectedAgent.id)} activeTab={selectedTab ?? "information"} onTabChange={onSelectTab} onBack={onBack} onChanged={onChanged} onDeclareNode={() => onDeclareNode(selectedAgent.id)} /></Box><NodeDialog agent={nodeCreation ? selectedAgent : null} onClose={onCloseNodeCreation} onCreated={async () => { await onChanged(); onCloseNodeCreation(); }} /></>;
  return <><Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, mb: 1.5 }}><Box sx={{ display: "flex", alignItems: "baseline", gap: 1.25, minWidth: 0 }}><Typography component="h1" variant="subtitle1">{t[RSC.AGENTS_LIST_TITLE_TEXT]}</Typography><Typography variant="caption" color="text.secondary" noWrap>{formatMessage(t[RSC.AGENTS_LIST_COUNT_TEXT], { count: snapshot.agents.length })}</Typography></Box><Button variant="contained" size="small" startIcon={<Icon name="add" fontSize="small" />} onClick={onRegister}>{t[RSC.AGENTS_REGISTER_BUTTON]}</Button></Box>
    <Box component="ul" aria-label={t[RSC.AGENTS_LIST_LABEL]} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>{inventory.agents.map((agent) => <AgentRow key={agent.id} agent={agent} onChanged={onChanged} onOpen={() => onOpenAgent(agent.id)} />)}</Box>
  </>;
};
