import { Alert, Box, Button, Chip, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { deployments } from "@p4studio/studio_domain/front";
import { canStartDeployment, type DeploymentRecord, type StageState } from "@p4studio/studio_domain/common";
import type { StudioSnapshot } from "../../../common/domain.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { ModelEditorPage } from "./ModelEditorPage.js";
import { startModels } from "./api.js";
import { RSC } from "./resource.js";
import { studioApi } from "../../shared/api/client.js";

const stateKeys: Record<DeploymentRecord["status"] | StageState, RSC> = {
  draft: RSC.MODELS_DRAFT_STATUS, pending: RSC.MODELS_PENDING_STATUS, creating: RSC.MODELS_CREATING_STATUS,
  loading: RSC.MODELS_LOADING_STATUS, ready: RSC.MODELS_READY_STATUS, unloading: RSC.MODELS_UNLOADING_STATUS,
  unloaded: RSC.MODELS_UNLOADED_STATUS, failed: RSC.MODELS_FAILED_STATUS, unknown: RSC.MODELS_UNKNOWN_STATUS,
};
export function ModelsView({ snapshot, selectedModelId, editor, onOpenModel, onCreate, onEdit, onCloseEditor, onSaved }: { snapshot: StudioSnapshot; selectedModelId?: string; editor?: "new" | "edit"; onOpenModel: (id: string) => void; onCreate: () => void; onEdit: (id: string) => void; onCloseEditor: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation(); const records = useModel(deployments.records).value; const activity = useModel(deployments.activity).value;
  const inspection = useModel(deployments.inspection).value;
  const [inventory, setInventory] = useState(snapshot);
  useEffect(startModels, []);
  useEffect(() => { setInventory(snapshot); }, [snapshot]);
  const refresh = async () => { await deployments.refresh(); try { setInventory(await studioApi.snapshot()); } catch (error) { deployments.activity.mutate(v => { v.error = String(error); }); } };
  const visibleRecords = selectedModelId ? records.filter((record) => record.id === selectedModelId) : records;
  if (editor) return <ModelEditorPage snapshot={inventory} recordId={editor === "edit" ? selectedModelId : undefined} onClose={onCloseEditor} onSaved={onSaved} />;
  return <Box component="section" aria-label={t[RSC.MODELS_LIST_LABEL]}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
      <Box><Typography component="h1" variant="h1">{t[RSC.MODELS_TITLE_TEXT]}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{t[RSC.MODELS_PURPOSE_MESSAGE]}</Typography></Box>
      <Box sx={{ display: "flex", gap: 1 }}><Button onClick={() => void refresh()}>{t[RSC.MODELS_REFRESH_BUTTON]}</Button><Button variant="contained" onClick={onCreate}>{t[RSC.MODELS_CREATE_BUTTON]}</Button></Box>
    </Box>
    {activity.error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{activity.error}</Alert>}
    {records.length === 0 && <Paper variant="outlined" sx={{ p: 4 }}><Typography variant="h2">{t[RSC.MODELS_EMPTY_TITLE_TEXT]}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{t[RSC.MODELS_EMPTY_DETAIL_MESSAGE]}</Typography><Button sx={{ mt: 2 }} variant="outlined" onClick={onCreate}>{t[RSC.MODELS_CREATE_BUTTON]}</Button></Paper>}
    <Box sx={{ display: "grid", gap: 2 }}>{visibleRecords.map(record => <Paper component="article" aria-label={record.name} variant="outlined" key={record.id} sx={{ overflow: "hidden" }}>
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box><Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}><Button onClick={() => onOpenModel(record.id)} sx={{ typography: "h2", minWidth: 0, p: 0, color: "text.primary", textTransform: "none", "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>{record.name}</Button><Chip size="small" label={t[stateKeys[record.status]]} color={record.status === "ready" ? "success" : ["failed", "unknown"].includes(record.status) ? "warning" : "default"} /></Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .7 }}>{formatMessage(t[RSC.MODELS_SUMMARY_MESSAGE], { adapter: record.adapter, agents: new Set(record.stages.map(s => s.agentId)).size, nodes: record.stages.length, layers: record.totalLayers })}</Typography>
          <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_RECEPTION_MESSAGE]}</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" disabled={activity.busy || !record.stages.length} onClick={() => void deployments.reconcile(record.id)}>{t[inspection.modelId === record.id ? RSC.MODELS_INSPECTING_STATUS : RSC.MODELS_INSPECT_BUTTON]}</Button>
          <Button disabled={activity.busy || !canStartDeployment(record)} onClick={() => onEdit(record.id)}>{t[RSC.MODELS_EDIT_BUTTON]}</Button>
          {canStartDeployment(record) ? <Button variant="contained" disabled={activity.busy || !record.stages.length} onClick={() => void deployments.operate(record.id, "load")}>{t[RSC.MODELS_LOAD_BUTTON]}</Button> : <Button variant="outlined" disabled={activity.busy || ["loading", "unloading"].includes(record.status)} onClick={() => void deployments.operate(record.id, "unload")}>{t[RSC.MODELS_UNLOAD_BUTTON]}</Button>}
          <Button color="secondary" disabled={activity.busy} onClick={() => void deployments.remove(record.id, true)}>{t[RSC.MODELS_DELETE_BUTTON]}</Button>
        </Box>
      </Box>
      {inspection.modelId === record.id && <LinearProgress aria-label={t[RSC.MODELS_INSPECTING_STATUS]} />}
      {record.reports.some(report => report.state === "unknown" && report.observation?.state === "loaded") && <Alert severity="info">{t[RSC.MODELS_INSPECT_GENERATION_MESSAGE]}</Alert>}
      {["loading", "unloading"].includes(record.status) && <LinearProgress aria-label={t[stateKeys[record.status]]} />}
      {record.error && <Alert severity="warning">{record.error}</Alert>}
      <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={record.name} sx={{ minWidth: 780 }}><TableHead><TableRow>
        <TableCell>{t[RSC.MODELS_AGENT_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_NODE_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_LAYERS_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_ARTIFACT_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_REPORT_LABEL]}</TableCell>
      </TableRow></TableHead><TableBody>{record.stages.map(stage => {
        const report = record.reports.find(r => r.stageId === stage.id);
        return <TableRow key={stage.id}><TableCell>{snapshot.agents.find(a => a.id === stage.agentId)?.name ?? stage.agentId}</TableCell><TableCell><Typography variant="body2">{stage.nodeId}</Typography><Typography variant="caption" color="text.secondary">{t[RSC.MODELS_GENERATION_LABEL]} {stage.nodeGeneration}</Typography></TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{`[${stage.layerStart}, ${stage.layerEnd})`}</TableCell><TableCell sx={{ maxWidth: 360, overflowWrap: "anywhere" }}>{stage.artifact}</TableCell><TableCell><Typography variant="body2">{t[stateKeys[report?.state ?? "pending"]]}</Typography>{report?.observation && <Box role="status"><Typography variant="caption" sx={{ display: "block" }}>{formatMessage(t[RSC.MODELS_OBSERVED_MESSAGE], { state: t[report.observation.state === "loaded" ? RSC.MODELS_OBSERVED_LOADED_STATUS : report.observation.state === "missing" ? RSC.MODELS_OBSERVED_MISSING_STATUS : stateKeys[report.observation.state]] })}</Typography><Typography variant="caption" color="text.secondary">{formatMessage(t[RSC.MODELS_CHECKED_MESSAGE], { time: new Date(report.observation.checkedAt).toLocaleString() })}</Typography></Box>}{(report?.detail || report?.failureDetail || report?.cleanupError) && <Typography variant="caption" color="warning.main">{[report.failureDetail, report.detail, report.cleanupError].filter((v, i, values) => v && values.indexOf(v) === i).join(" · ")}</Typography>}{report?.telemetry != null && <Box component="details"><Box component="summary" sx={{ cursor: "pointer", color: "text.secondary" }}>{t[RSC.MODELS_TELEMETRY_TEXT]}</Box><Box component="pre" sx={{ maxWidth: 360, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11 }}>{JSON.stringify(report.telemetry, null, 2)}</Box></Box>}</TableCell></TableRow>;
      })}</TableBody></Table></Box>
      <Box sx={{ px: 2, py: 1.25, color: "text.secondary" }}><Typography variant="caption">{formatMessage(t[RSC.MODELS_COMPLETION_MESSAGE], { ready: record.reports.filter(r => r.state === "ready").length, total: record.stages.length })}</Typography>{record.loadGeneration > 0 && <Typography variant="caption" sx={{ display: "block" }}>{t[RSC.MODELS_LOAD_GENERATION_LABEL]}: {record.loadGeneration}</Typography>}</Box>
    </Paper>)}</Box>

  </Box>;
}
