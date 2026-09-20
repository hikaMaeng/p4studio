import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { deployments } from "@p4studio/studio_domain/front";
import { canStartDeployment, type DeploymentInput } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { NodeInspector } from "./NodeInspector.js";
import { PlacementCanvas } from "./PlacementCanvas.js";
import { PlacementEditor } from "./PlacementEditor.js";
import { RSC } from "./resource.js";
import { useGraphInventory } from "../../p4/inventory.js";
import { GraphFeedback } from "./GraphNameEditor.js";

export function ModelEditorPage({ snapshot: initialSnapshot, recordId, onClose, onSaved }: { snapshot: StudioSnapshot; recordId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const snapshot = useGraphInventory(initialSnapshot);
  const { t } = useTranslation();
  const editor = useModel(deployments.editor).value, activity = useModel(deployments.activity).value, records = useModel(deployments.records).value;
  const [generalOpen, setGeneralOpen] = useState(false);
  const node = useModel(deployments.nodeSelection).value;
  const selectedId = useModel(deployments.selection).value, value = editor.input;
  useEffect(() => {
    const record = recordId ? records.find((item) => item.id === recordId) : undefined;
    if (recordId && !record) return;
    if (!editor.open || editor.id !== recordId) deployments.open(record);
  }, [recordId, records, editor.open, editor.id]);
  const update = <K extends keyof DeploymentInput>(key: K, data: DeploymentInput[K]) => deployments.editor.mutate((current) => { current.input[key] = data; });
  const selected = value.stages.findIndex((stage) => stage.id === selectedId);
  const close = () => { deployments.close(); onClose(); };
  if (recordId && !records.some((record) => record.id === recordId)) return <Alert severity="info">{t[RSC.MODELS_RECORD_PENDING_MESSAGE]}<Button onClick={close}>{t[RSC.MODELS_BACK_BUTTON]}</Button></Alert>;
  if (recordId && !canStartDeployment(records.find(record => record.id === recordId)!)) return <Alert severity="warning">{t[RSC.MODELS_RECOVERY_MESSAGE]}<Button onClick={close}>{t[RSC.MODELS_BACK_BUTTON]}</Button></Alert>;
  const dismiss = () => { deployments.selection.set(""); deployments.nodeSelection.set(null); };
  const panelOpen = selected >= 0 || node !== null;
  return <Box component="section" aria-label={t[RSC.MODELS_EDITOR_TITLE_TEXT]} sx={{ height: "calc(100dvh - 56px)", minHeight: 480 }}>
    <Box component="form" onSubmit={(event) => { event.preventDefault(); void deployments.save().then((record) => { if (record) onSaved(record.id); }); }} sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box component="header" sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, flexShrink: 0 }}>
        <Button variant="outlined" size="small" onClick={close}>{t[RSC.MODELS_BACK_BUTTON]}</Button>
        <Box sx={{ flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_EDITOR_TITLE_TEXT]}</Typography>
          <Typography component="h1" sx={{ fontSize: 18, lineHeight: 1.4, fontWeight: 600, overflowWrap: "anywhere" }}>{value.name || t[RSC.MODELS_CREATE_BUTTON]}</Typography>
        </Box>
        <Button size="small" variant="outlined" aria-expanded={generalOpen} aria-controls="model-general-settings" onClick={() => setGeneralOpen(!generalOpen)}>{t[RSC.MODELS_GENERAL_TEXT]}</Button>
        <Button size="small" variant="contained" disabled={activity.busy} type="submit">{t[RSC.MODELS_SAVE_BUTTON]}</Button>
      </Box>
      {activity.error && <Alert severity="error" role="alert">{activity.error}</Alert>}
      <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_LIFECYCLE_MESSAGE]}</Typography>
      <GraphFeedback />
      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        <PlacementCanvas snapshot={snapshot} />
        {panelOpen && <Paper component="aside" data-testid="model-node-inspector" aria-label={t[RSC.MODELS_NODE_LABEL]} variant="outlined" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); dismiss(); } }} sx={{ position: "absolute", insetInlineEnd: 12, top: 12, bottom: 12, width: { xs: "calc(100% - 24px)", sm: 380 }, maxWidth: "calc(100% - 24px)", zIndex: 5, boxShadow: 8, display: "flex", flexDirection: "column", overflow: "hidden", ...inspectorStyle }}>
          <Box sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography component="h2" sx={{ flex: 1, fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{value.stages[selected]?.nodeId ?? node?.nodeId}</Typography>
            <Button size="small" onClick={dismiss}>{t[RSC.MODELS_PANEL_CLOSE_BUTTON]}</Button>
          </Box>
          <Box sx={{ p: 1.5, display: "grid", gap: 1.5, overflowY: "auto", minHeight: 0 }}>
            {selected >= 0 ? <PlacementEditor key={selectedId} id={selectedId} index={selected} snapshot={snapshot} /> : <NodeInspector snapshot={snapshot} />}
          </Box>
        </Paper>}
        {generalOpen && <Paper id="model-general-settings" component="section" aria-label={t[RSC.MODELS_GENERAL_TEXT]} variant="outlined" sx={{ position: "absolute", insetInlineEnd: 12, top: 12, zIndex: 6, p: 2, width: 380, maxWidth: "calc(100% - 24px)", maxHeight: "calc(100% - 24px)", overflowY: "auto", boxSizing: "border-box", boxShadow: 8, display: "grid", gap: 1.5, ...inspectorStyle }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Typography component="h2" variant="h2">{t[RSC.MODELS_GENERAL_TEXT]}</Typography><Button size="small" onClick={() => setGeneralOpen(false)}>{t[RSC.MODELS_PANEL_CLOSE_BUTTON]}</Button></Box>
          <TextField required label={t[RSC.MODELS_NAME_LABEL]} value={value.name} onChange={(event) => update("name", event.target.value)} />
          <Typography variant="body2" color="text.secondary">{t[RSC.MODELS_RECEPTION_MESSAGE]}</Typography>
          <TextField required type="number" label={t[RSC.MODELS_TOTAL_LAYERS_LABEL]} value={value.totalLayers} slotProps={{ htmlInput: { min: 1 } }} onChange={(event) => update("totalLayers", Number(event.target.value))} />
          <TextField required type="number" label={t[RSC.MODELS_TIMEOUT_LABEL]} value={value.timeoutMs} slotProps={{ htmlInput: { min: 1, max: 86400000 } }} onChange={(event) => update("timeoutMs", Number(event.target.value))} />
        </Paper>}
      </Box>
    </Box>
  </Box>;
}

// Feature-local density: the graph and the rest of Studio retain their own type scale.
const inspectorStyle = {
  fontSize: 12,
  "& .MuiTypography-h2": { fontSize: 13, lineHeight: 1.5 },
  "& .MuiTypography-body1, & .MuiTypography-body2, & .MuiInputBase-root": { fontSize: 12, lineHeight: 1.5 },
  "& .MuiInputLabel-root": { fontSize: 12 },
  "& .MuiTypography-caption, & .MuiFormHelperText-root": { fontSize: 11, lineHeight: 1.5 },
  "& .MuiButton-root": { fontSize: 11, minWidth: 0, px: 1 },
};
