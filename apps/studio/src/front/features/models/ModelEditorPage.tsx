import { Alert, Box, Button, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useEffect } from "react";
import { deployments } from "@p4studio/studio_domain/front";
import type { DeploymentInput } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { NodeInspector } from "./NodeInspector.js";
import { PlacementCanvas } from "./PlacementCanvas.js";
import { PlacementEditor } from "./PlacementEditor.js";
import { RSC } from "./resource.js";
import { useGraphInventory } from "./inventory.js";
import { GraphFeedback } from "./GraphNameEditor.js";

export function ModelEditorPage({ snapshot: initialSnapshot, recordId, onClose, onSaved }: { snapshot: StudioSnapshot; recordId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const snapshot = useGraphInventory(initialSnapshot);
  const { t } = useTranslation();
  const editor = useModel(deployments.editor).value, activity = useModel(deployments.activity).value, records = useModel(deployments.records).value;
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
  return <Box component="section" aria-label={t[RSC.MODELS_EDITOR_TITLE_TEXT]} sx={{ height: "100%" }}>
    <Typography component="h1" sx={{ position: "absolute", width: 1, height: 1, p: 0, m: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>{t[RSC.MODELS_EDITOR_TITLE_TEXT]}</Typography>
    <Box component="form" onSubmit={(event) => { event.preventDefault(); void deployments.save().then((record) => { if (record) onSaved(record.id); }); }} sx={{ height: { lg: "calc(100dvh - 56px)" }, minHeight: 560, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 400px" }, gap: 2.5, alignItems: "stretch" }}>
      <PlacementCanvas snapshot={snapshot} />
      <Box component="aside" aria-label={t[RSC.MODELS_NODE_LABEL]} sx={{ display: "grid", alignContent: "start", gap: 2, minWidth: 0, minHeight: 0, overflowY: "auto" }}>
        {activity.error && <Alert severity="error" role="alert">{activity.error}</Alert>}
        <GraphFeedback />
        <NodeInspector snapshot={snapshot} />
        {selected >= 0 && <PlacementEditor key={selectedId} id={selectedId} index={selected} snapshot={snapshot} />}
        <Paper component="details" variant="outlined" open sx={{ overflow: "hidden" }}>
          <Box component="summary" sx={{ cursor: "pointer", px: 2, py: 1.5 }}><Typography component="h2" variant="h2">{t[RSC.MODELS_GENERAL_TEXT]}</Typography></Box>
          <Box sx={{ p: 2, pt: .5, display: "grid", gap: 1.5 }}>
            <TextField required label={t[RSC.MODELS_NAME_LABEL]} value={value.name} onChange={(event) => update("name", event.target.value)} />
            <TextField select label={t[RSC.MODELS_INGRESS_LABEL]} value={value.ingressAgentId} onChange={(event) => update("ingressAgentId", event.target.value)}><MenuItem value="">{t[RSC.MODELS_UNMAPPED_TEXT]}</MenuItem>{snapshot.agents.map((agent) => <MenuItem key={agent.id} value={agent.id}>{agent.name}</MenuItem>)}</TextField>
            <TextField required type="number" label={t[RSC.MODELS_TOTAL_LAYERS_LABEL]} value={value.totalLayers} slotProps={{ htmlInput: { min: 1 } }} onChange={(event) => update("totalLayers", Number(event.target.value))} />
            <TextField required type="number" label={t[RSC.MODELS_TIMEOUT_LABEL]} value={value.timeoutMs} slotProps={{ htmlInput: { min: 1, max: 86400000 } }} onChange={(event) => update("timeoutMs", Number(event.target.value))} />
            <Box sx={{ display: "flex", justifyContent: "end", gap: 1 }}><Button disabled={activity.busy} onClick={close}>{t[RSC.MODELS_CANCEL_BUTTON]}</Button><Button variant="contained" disabled={activity.busy} type="submit">{t[RSC.MODELS_SAVE_BUTTON]}</Button></Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  </Box>;
}
