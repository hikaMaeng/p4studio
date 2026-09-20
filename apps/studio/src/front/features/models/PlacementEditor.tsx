import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { deployments } from "@p4studio/studio_domain/front";
import { buildLoadPayload, llamaPlanSummary, type PlacementStage } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { RSC } from "./resource.js";

const codeStyle = { fontSize: 12, lineHeight: 1.5 };
export function PlacementEditor({ id, index, snapshot }: { id: string; index: number; snapshot: StudioSnapshot }) {
  const { t } = useTranslation(), input = useModel(deployments.editor).value.input, stage = input.stages.find(s => s.id === id)!;
  const agent = snapshot.agents.find(a => a.id === stage.agentId);
  const update = <K extends keyof PlacementStage>(key: K, value: PlacementStage[K]) => deployments.updateStage(id, key, value);
  let payload: Record<string, unknown> | undefined, error = "";
  try { if (input.adapter === "llamacpp") llamaPlanSummary(stage.planText ?? ""); payload = buildLoadPayload(input, stage, 1); }
  catch (e) { error = e instanceof Error ? e.message : String(e); }
  return <Paper component="fieldset" variant="outlined" sx={{ p: 1.5, m: 0, minWidth: 0 }}>
    <Box component="legend" sx={{ px: .5 }}>{formatMessage(t[RSC.MODELS_STAGE_TEXT], { index: index + 1 })}</Box>
    <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", mb: 1.5, gap: .5 }}><Typography variant="h2">{t[RSC.MODELS_STAGE_ROUTING_TEXT]}</Typography><Box><Button size="small" disabled={index === 0} onClick={() => deployments.moveStage(id, -1)}>{t[RSC.MODELS_MOVE_UP_BUTTON]}</Button><Button size="small" disabled={index === input.stages.length - 1} onClick={() => deployments.moveStage(id, 1)}>{t[RSC.MODELS_MOVE_DOWN_BUTTON]}</Button><Button size="small" color="secondary" onClick={() => deployments.removeStage(id)}>{t[RSC.MODELS_REMOVE_NODE_BUTTON]}</Button></Box></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 64px", "& > :first-of-type": { gridColumn: "1 / -1" }, gap: 1.5 }}>
      <TextField label={t[RSC.MODELS_AGENT_LABEL]} value={agent?.name ?? stage.agentId} slotProps={{ input: { readOnly: true } }} />
      <TextField label={t[RSC.MODELS_NODE_LABEL]} value={stage.nodeId} onChange={e => update("nodeId", e.target.value)} />
      <TextField label={t[RSC.MODELS_GENERATION_LABEL]} value={stage.nodeGeneration} slotProps={{ input: { readOnly: true } }} />
    </Box>
    {stage.referenceAgent && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>{t[RSC.MODELS_REFERENCE_AGENT_LABEL]}: {stage.referenceAgent}</Typography>}
    {input.adapter === "llamacpp" ? <Box sx={{ display: "grid", gap: 2, mt: 2 }}>
      <Box><Typography variant="h2">{t[RSC.MODELS_ARGUMENTS_TITLE_TEXT]}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.MODELS_ARGUMENTS_MESSAGE]}</Typography></Box>
      <TextField fullWidth multiline minRows={6} maxRows={12} label={t[RSC.MODELS_PLAN_LABEL]} value={stage.planText ?? ""} onChange={e => update("planText", e.target.value)} slotProps={{ input: { sx: codeStyle }, htmlInput: { spellCheck: false, dir: "ltr" } }} />
      <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, overflowWrap: "anywhere" }}><Typography variant="caption" color="text.secondary">{t[RSC.MODELS_PLAN_SUMMARY_TEXT]}</Typography><Typography variant="body2" dir="ltr">{`[${stage.layerStart}, ${stage.layerEnd}) · ${stage.device}`}</Typography><Typography variant="body2" sx={{ mt: .5, ...codeStyle }}>{stage.artifact}</Typography></Box>
      <TextField fullWidth multiline minRows={5} maxRows={12} label={t[RSC.MODELS_LOAD_OPTIONS_LABEL]} value={stage.loadOptionsJson ?? "{}"} onChange={e => update("loadOptionsJson", e.target.value)} helperText={t[RSC.MODELS_LOAD_OPTIONS_MESSAGE]} slotProps={{ input: { sx: codeStyle }, htmlInput: { spellCheck: false, dir: "ltr" } }} />
    </Box> : <Box sx={{ display: "grid", gap: 2, mt: 2 }}><Box sx={{ display: "flex", gap: 2 }}><TextField type="number" label={t[RSC.MODELS_LAYER_START_LABEL]} value={stage.layerStart} onChange={e => update("layerStart", Number(e.target.value))} /><TextField type="number" label={t[RSC.MODELS_LAYER_END_LABEL]} value={stage.layerEnd} onChange={e => update("layerEnd", Number(e.target.value))} /></Box><TextField fullWidth multiline minRows={8} maxRows={16} label={t[RSC.MODELS_PAYLOAD_LABEL]} value={stage.customPayload} onChange={e => update("customPayload", e.target.value)} slotProps={{ input: { sx: codeStyle }, htmlInput: { spellCheck: false, dir: "ltr" } }} /></Box>}
    {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
    {payload && <Box component="details" sx={{ mt: 2 }}><Box component="summary" sx={{ cursor: "pointer" }}>{t[RSC.MODELS_COMMAND_PREVIEW_TEXT]}</Box><Typography variant="caption" color="text.secondary">{t[RSC.MODELS_GENERATION_ASSIGNED_MESSAGE]}</Typography><Box component="pre" dir="ltr" sx={{ ...codeStyle, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 480, overflowY: "auto" }}>{JSON.stringify({ ...payload, load_generation: undefined }, null, 2)}</Box></Box>}
    {agent?.inspection.state !== "available" && <Typography color="warning.main" variant="caption" sx={{ display: "block", mt: 2 }}>{t[RSC.MODELS_INSPECTION_MESSAGE]}</Typography>}
  </Paper>;
}
