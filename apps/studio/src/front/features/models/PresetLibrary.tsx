import { Alert, Box, Button, Chip, Paper, Typography } from "@mui/material";
import { deploymentPresets } from "@p4studio/studio_domain/common";
import { deployments } from "@p4studio/studio_domain/front";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { RSC } from "./resource.js";

export function PresetLibrary({ snapshot }: { snapshot: StudioSnapshot }) {
  const { t } = useTranslation(), value = useModel(deployments.editor).value.input;
  const open = useModel(deployments.libraryOpen).value;
  return <Paper variant="outlined" sx={{ p: 2.5 }}>
    <Button onClick={() => deployments.libraryOpen.set(!open)} aria-expanded={open} sx={{ p: 0, typography: "h2", color: "text.primary" }}>{t[RSC.MODELS_PRESETS_TITLE_TEXT]}</Button>
    {!open && value.presetId && <Typography variant="body2" sx={{ mt: 1 }}>{deploymentPresets.find(p => p.id === value.presetId)?.name}</Typography>}
    {open && <Box>
    <Typography variant="body2" color="text.secondary" sx={{ mt: .7, mb: 2 }}>{t[RSC.MODELS_PRESETS_MESSAGE]}</Typography>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>{deploymentPresets.map(preset => <Box key={preset.id} sx={{ border: "1px solid", borderColor: value.presetId === preset.id ? "primary.main" : "divider", borderRadius: 1.5, p: 2, minWidth: 0 }}>
      <Typography component="h3" variant="h2">{preset.name}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{formatMessage(t[RSC.MODELS_SUMMARY_MESSAGE], { adapter: preset.adapter, agents: new Set(preset.stages.map(s => s.referenceAgent)).size, nodes: preset.stages.length, layers: preset.totalLayers })}</Typography>
      <Chip size="small" color={preset.source.passed ? "default" : "warning"} label={t[preset.source.passed ? RSC.MODELS_EVIDENCE_COMPLETED_TEXT : RSC.MODELS_EVIDENCE_PARTIAL_TEXT]} />
      <Typography variant="caption" sx={{ display: "block", my: 1 }}>{formatMessage(t[RSC.MODELS_EVIDENCE_COUNTS_MESSAGE], { completed: preset.source.completed, total: preset.source.requests })}</Typography>
      <Button variant="outlined" onClick={() => deployments.applyPreset(preset, snapshot.agents)}>{t[RSC.MODELS_USE_PRESET_BUTTON]}</Button>
      <Box component="details" sx={{ mt: 1.5 }}><Box component="summary" sx={{ cursor: "pointer", color: "text.secondary" }}>{t[RSC.MODELS_PROVENANCE_TEXT]}</Box><Box component="pre" sx={{ fontSize: 11, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 250, overflowY: "auto" }}>{JSON.stringify(preset.source, null, 2)}</Box></Box>
    </Box>)}</Box>
    </Box>}
    {value.presetId && <Alert severity="info" sx={{ mt: 2 }}>{t[RSC.MODELS_PRESET_MAPPING_MESSAGE]}</Alert>}
  </Paper>;
}
