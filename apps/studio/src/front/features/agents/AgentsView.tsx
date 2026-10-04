import { Alert, Box, Button, Typography } from "@mui/material";
import type { StudioSnapshot } from "../../../common/domain.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { EmptyState } from "../../shared/components/EmptyState.js";
import { Icon } from "../../shared/components/Icon.js";
import { useGraphInventory } from "../../p4/inventory.js";
import { AgentDetailView } from "./AgentDetailView.js";
import { AgentRemovalDialog } from "./AgentRemovalDialog.js";
import { AgentRow } from "./AgentRow.js";
import { NodeDialog } from "./NodeDialog.js";
import { RSC } from "./resource.js";
import { navigate } from "../../shell/routes.js";
import { MenuHeader } from "../../shared/components/MenuHeader.js";

export const AgentsView = (props: Parameters<typeof AgentsSurface>[0]) => <><AgentsSurface {...props} /><AgentRemovalDialog onChanged={props.onChanged} /></>;

const AgentsSurface = ({ snapshot, selectedAgentId, selectedTab, nodeCreation, onChanged, onRegister, onOpenAgent, onBack, onSelectTab, onDeclareNode, onCloseNodeCreation }: { snapshot: StudioSnapshot; selectedAgentId?: string; selectedTab?: "information" | "nodes"; nodeCreation?: boolean; onChanged: () => Promise<void>; onRegister: () => void; onOpenAgent: (agentId: string) => void; onBack: () => void; onSelectTab: (tab: "information" | "nodes") => void; onDeclareNode: (agentId: string) => void; onCloseNodeCreation: () => void }) => {
  const { t } = useTranslation();
  const inventory = useGraphInventory(snapshot);
  const selectedAgent = inventory.agents.find((agent) => agent.id === selectedAgentId);
  const listHeader = <MenuHeader title={t[RSC.AGENTS_LIST_TITLE_TEXT]} meta={<Typography variant="caption" color="text.secondary" noWrap>{formatMessage(t[RSC.AGENTS_LIST_COUNT_TEXT], { count: snapshot.agents.length })}</Typography>} actions={<><Button size="small" onClick={() => navigate({ kind: "agent-groups" })}>{t[RSC.AGENTS_GROUPS_BUTTON]}</Button><Button variant="contained" size="small" startIcon={<Icon name="add" fontSize="small" />} onClick={onRegister}>{t[RSC.AGENTS_REGISTER_BUTTON]}</Button></>} />;
  if (selectedAgentId !== undefined && !selectedAgent) return <Alert severity="warning">{t[RSC.AGENTS_MISSING_MESSAGE]}<Button onClick={onBack}>{t[RSC.AGENTS_BACK_BUTTON]}</Button></Alert>;
  if (inventory.agents.length === 0) return <>{listHeader}<EmptyState title={t[RSC.AGENTS_EMPTY_TITLE_TEXT]} detail={t[RSC.AGENTS_EMPTY_DETAIL_MESSAGE]} /></>;
  if (selectedAgent) return <><AgentDetailView agent={selectedAgent} declaredNodes={inventory.nodes.filter((node) => node.agentId === selectedAgent.id)} activeTab={selectedTab ?? "information"} onTabChange={onSelectTab} onBack={onBack} onChanged={onChanged} onDeclareNode={() => onDeclareNode(selectedAgent.id)} /><NodeDialog agent={nodeCreation ? selectedAgent : null} onClose={onCloseNodeCreation} onCreated={async () => { await onChanged(); onCloseNodeCreation(); }} /></>;
  return <>{listHeader}
    <Box component="ul" aria-label={t[RSC.AGENTS_LIST_LABEL]} sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>{inventory.agents.map((agent) => <AgentRow key={agent.id} agent={agent} onChanged={onChanged} onOpen={() => onOpenAgent(agent.id)} />)}</Box>
  </>;
};
