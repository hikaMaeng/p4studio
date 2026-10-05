import { Box, Chip, Paper, Typography } from "@mui/material";
import type { P4RegisteredNodeSnapshot } from "@p4studio/p4-protocol";
import { graphInventory } from "@p4studio/studio_domain/front";
import type { AgentViewRecord } from "../../../../common/domain.js";
import { formatDateTime, formatMessage } from "../../../i18n/format.js";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { RSC as AGENT_RSC } from "../resource.js";
import { NodeUnloadButton } from "../NodeUnloadButton.js";
import { JsonCapsules, readSnapshot, ValueCapsule } from "./JsonCapsules.js";
import { RSC } from "./resource.js";

const lifecycleLabels = {
  loading: RSC.AGENTS_NODE_LOADING_STATUS, loaded: RSC.AGENTS_NODE_LOADED_STATUS,
  unloading: RSC.AGENTS_NODE_UNLOADING_STATUS, failed: RSC.AGENTS_NODE_FAILED_STATUS,
};

function NodeCard({ node, agent }: { node: P4RegisteredNodeSnapshot; agent: AgentViewRecord }) {
  const { t } = useTranslation();
  const state = readSnapshot(node.state);
  return <Paper component="li" data-testid="agent-node-card" aria-label={node.nodeId} variant="outlined" sx={{ minWidth: 0, p: { xs: 1.5, md: 2 }, bgcolor: "background.paper" }}>
    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.25 }}>
      <Box sx={{ minWidth: 0 }}><Typography component="h4" variant="subtitle1" sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>{node.nodeId}</Typography>
        <Chip size="small" variant="outlined" color={node.lifecycleState === "loaded" ? "success" : node.lifecycleState === "failed" ? "error" : "default"} label={t[node.lifecycleState ? lifecycleLabels[node.lifecycleState] : RSC.AGENTS_NODE_UNKNOWN_STATUS]} sx={{ mt: .75 }} />
      </Box>
      {node.lifecycleState === "loaded" && <NodeUnloadButton target={{ agentId: agent.id, nodeId: node.nodeId, nodeGeneration: node.generation, adapterKind: node.adapterKind }} onCompleted={() => graphInventory.refresh(agent)} />}
    </Box>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: .75 }}>
      <ValueCapsule name={t[RSC.AGENTS_NODE_ADAPTER_LABEL]} value={node.adapterKind} />
      <ValueCapsule name={t[RSC.AGENTS_NODE_GENERATION_LABEL]} value={node.generation} />
      <ValueCapsule name={t[RSC.AGENTS_NODE_LOAD_GENERATION_LABEL]} value={node.loadGeneration ?? undefined} />
    </Box>
    <Box component="section" aria-label={t[RSC.AGENTS_NODE_ADAPTER_STATE_LABEL]} sx={{ mt: 2, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
      <Typography component="h5" variant="body2" sx={{ mb: 1, fontWeight: 500 }}>{t[RSC.AGENTS_NODE_ADAPTER_STATE_LABEL]}</Typography>
      <JsonCapsules value={state} name={t[RSC.AGENTS_NODE_STATE_LABEL]} />
      {(state === null || typeof state !== "object") && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{t[RSC.AGENTS_NODE_ADAPTER_BRIEF_MESSAGE]}</Typography>}
    </Box>
    {node.delivery && <Box component="section" aria-label={t[RSC.AGENTS_NODE_DELIVERY_LABEL]} sx={{ mt: 2 }}>
      <Typography component="h5" variant="body2" sx={{ mb: 1, fontWeight: 500 }}>{t[RSC.AGENTS_NODE_DELIVERY_LABEL]}</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: .75 }}>
        <ValueCapsule name={t[RSC.AGENTS_NODE_WORKER_STOPPED_LABEL]} value={node.delivery.stopped} />
        <ValueCapsule name={t[RSC.AGENTS_NODE_INPUT_RETAINED_LABEL]} value={node.delivery.inputRetained} />
        <ValueCapsule name={t[RSC.AGENTS_NODE_COMPLETION_RETAINED_LABEL]} value={node.delivery.completionRetained} />
      </Box>
    </Box>}
    {node.lifecycleResult && <Box component="section" aria-label={t[RSC.AGENTS_NODE_LIFECYCLE_RESULT_LABEL]} sx={{ mt: 2 }}>
      <Typography component="h5" variant="body2" sx={{ mb: 1, fontWeight: 500 }}>{t[RSC.AGENTS_NODE_LIFECYCLE_RESULT_LABEL]}</Typography>
      <JsonCapsules value={node.lifecycleResult} name={t[RSC.AGENTS_NODE_LIFECYCLE_RESULT_LABEL]} />
    </Box>}
  </Paper>;
}

// See apps/studio/docs/usage.md#agent-nodes and docs/constraints.md.
export function NodeCards({ agent }: { agent: AgentViewRecord }) {
  const { t, language } = useTranslation();
  const snapshot = agent.inspection.snapshot;
  if (!snapshot) return <Typography role="status" color="text.secondary">{t[agent.inspection.state === "pending" ? AGENT_RSC.AGENTS_INSPECTION_PENDING_STATUS : AGENT_RSC.AGENTS_NOT_INSPECTED_TEXT]}</Typography>;
  return <Box component="section" aria-label={formatMessage(t[AGENT_RSC.AGENTS_P4_REGISTERED_LABEL], { name: agent.name })}>
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 1, mb: 1.5 }}>
      <Typography component="h3" variant="subtitle1">{t[RSC.AGENTS_NODE_OBSERVED_TITLE_TEXT]}</Typography>
      <Typography variant="caption" color="text.secondary">{formatMessage(t[AGENT_RSC.AGENTS_P4_EVENT_TEXT], { version: snapshot.protocolVersion, date: formatDateTime(snapshot.generatedAtUnixMs, language) })}</Typography>
    </Box>
    {agent.inspection.state === "error" && <Typography role="status" color="warning.main" sx={{ mb: 1.5 }}>{t[RSC.AGENTS_NODE_PREVIOUS_OBSERVATION_MESSAGE]}</Typography>}
    {snapshot.nodes.length === 0 ? <Typography color="text.secondary" variant="body2">{t[AGENT_RSC.AGENTS_P4_REGISTERED_EMPTY_MESSAGE]}</Typography>
      : <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 2, alignItems: "start" }}>
        {snapshot.nodes.map(node => <NodeCard key={JSON.stringify([node.nodeId, node.generation])} node={node} agent={agent} />)}
      </Box>}
  </Box>;
}
