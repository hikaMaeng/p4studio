import { Box, Paper, Typography } from "@mui/material";
import { deployments, graphInventory } from "@p4studio/studio_domain/front";
import { nodeLabelKey } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";

export function NodeInspector({ snapshot }: { snapshot: StudioSnapshot }) {
  const { t } = useTranslation();
  const selected = useModel(deployments.nodeSelection).value;
  const labels = useModel(graphInventory.labels).value;
  if (!selected) return <Paper component="section" aria-label={t[RSC.MODELS_NODE_LABEL]} variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.MODELS_SELECT_STAGE_MESSAGE]}</Typography></Paper>;
  const agent = snapshot.agents.find((value) => value.id === selected.agentId);
  const node = agent?.inspection.snapshot?.nodes.find((value) => value.nodeId === selected.nodeId && value.generation === selected.nodeGeneration);
  const fields = [[t[RSC.MODELS_AGENT_LABEL], agent?.name ?? selected.agentId], [t[RSC.MODELS_GRAPH_NODE_NAME_LABEL], labels.get(nodeLabelKey(selected.agentId, selected.nodeId))?.name ?? selected.nodeId], [t[RSC.MODELS_NODE_LABEL], selected.nodeId], [t[RSC.MODELS_GENERATION_LABEL], String(selected.nodeGeneration)], [t[RSC.MODELS_ADAPTER_LABEL], selected.adapterKind]];
  return <Paper component="section" aria-label={t[RSC.MODELS_NODE_LABEL]} variant="outlined" sx={{ p: 2.5, display: "grid", gap: 1.5 }}>
    <Typography variant="h2">{t[RSC.MODELS_STAGE_ROUTING_TEXT]}</Typography>
    <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_GRAPH_NODE_NAME_MESSAGE]}</Typography>
    <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: .75, m: 0 }}>
      {fields.map(([label, value]) => <Box component="div" key={label} sx={{ display: "contents" }}><Box component="dt" sx={{ color: "text.secondary" }}>{label}</Box><Box component="dd" sx={{ m: 0, overflowWrap: "anywhere" }}>{value}</Box></Box>)}
    </Box>
    {node && <Box component="details"><Box component="summary" sx={{ cursor: "pointer", color: "text.secondary" }}>{t[RSC.MODELS_PROTOCOL_TITLE_TEXT]}</Box><Box component="pre" dir="ltr" sx={{ m: 0, mt: 1, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(node.state, null, 2)}</Box></Box>}
  </Paper>;
}
