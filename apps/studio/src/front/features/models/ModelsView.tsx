import { Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
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
import { Icon } from "../../shared/components/Icon.js";
import { MenuHeader } from "../../shared/components/MenuHeader.js";

const stateKeys: Record<DeploymentRecord["status"] | StageState, RSC> = {
  draft: RSC.MODELS_DRAFT_STATUS, pending: RSC.MODELS_PENDING_STATUS, creating: RSC.MODELS_CREATING_STATUS,
  loading: RSC.MODELS_LOADING_STATUS, loaded: RSC.MODELS_LOADED_STATUS, ready: RSC.MODELS_READY_STATUS, unloading: RSC.MODELS_UNLOADING_STATUS,
  unloaded: RSC.MODELS_UNLOADED_STATUS, failed: RSC.MODELS_FAILED_STATUS, unknown: RSC.MODELS_UNKNOWN_STATUS,
};
function stageAgentDisplay(snapshot: StudioSnapshot, record: DeploymentRecord, stage: DeploymentRecord["stages"][number]) {
  const exact = snapshot.agents.find(agent => agent.id === stage.agentId);
  if (exact) return { name: exact.name, route: "" };
  const address = record.resolvedAddresses[stage.agentId] ?? stage.referenceAgent;
  if (address) {
    try {
      new URL(address);
      return { name: stage.agentId, route: address };
    } catch { /* Keep the unresolved identity visible when the saved route is malformed. */ }
  }
  return { name: stage.agentId, route: "" };
}
export function ModelsView({ snapshot, selectedModelId, editor, onOpenModel, onCreate, onEdit, onCloseEditor, onSaved }: { snapshot: StudioSnapshot; selectedModelId?: string; editor?: "new" | "edit"; onOpenModel: (id: string) => void; onCreate: () => void; onEdit: (id: string) => void; onCloseEditor: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation(); const records = useModel(deployments.records).value; const activity = useModel(deployments.activity).value;
  const inspection = useModel(deployments.inspection).value;
  const [inventory, setInventory] = useState(snapshot);
  const [selectedReportStageId, setSelectedReportStageId] = useState<string | null>(null);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(() => new Set());
  useEffect(startModels, []);
  useEffect(() => { setInventory(snapshot); }, [snapshot]);
  const refresh = async () => { await deployments.refresh(); try { setInventory(await studioApi.snapshot()); } catch (error) { deployments.activity.mutate(v => { v.error = String(error); }); } };
  const agentNamesFor = (record: DeploymentRecord) => [...new Map(record.stages.map(stage => [stage.agentId, {
    name: stageAgentDisplay(inventory, record, stage).name,
    known: inventory.agents.some(agent => agent.id === stage.agentId),
  }])).values()]
    .sort((left, right) => Number(right.known) - Number(left.known)
      || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }))
    .map(agent => agent.name).join(", ") || t[RSC.MODELS_UNMAPPED_TEXT];
  const visibleRecords = [...(selectedModelId ? records.filter((record) => record.id === selectedModelId) : records)].sort((left, right) =>
    agentNamesFor(left).localeCompare(agentNamesFor(right), undefined, { numeric: true, sensitivity: "base" })
      || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
  const selectedReport = visibleRecords.flatMap((record) => record.stages.map((stage) => ({ record, stage, report: record.reports.find((value) => value.stageId === stage.id) }))).find((value) => value.stage.id === selectedReportStageId);
  if (editor) return <ModelEditorPage snapshot={inventory} recordId={editor === "edit" ? selectedModelId : undefined} onClose={onCloseEditor} onSaved={onSaved} />;
  return <Box component="section" aria-label={t[RSC.MODELS_LIST_LABEL]}>
    <MenuHeader title={t[RSC.MODELS_TITLE_TEXT]} meta={<Typography variant="caption" color="text.secondary" noWrap>{formatMessage(t[RSC.MODELS_LIST_COUNT_TEXT], { count: records.length })}</Typography>} actions={<><Button size="small" onClick={() => void refresh()}>{t[RSC.MODELS_REFRESH_BUTTON]}</Button><Button size="small" variant="contained" onClick={onCreate}>{t[RSC.MODELS_CREATE_BUTTON]}</Button></>} />
    {activity.error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{activity.error}</Alert>}
    {records.length === 0 && <Paper variant="outlined" sx={{ p: 4 }}><Typography variant="h2">{t[RSC.MODELS_EMPTY_TITLE_TEXT]}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{t[RSC.MODELS_EMPTY_DETAIL_MESSAGE]}</Typography><Button sx={{ mt: 2 }} variant="outlined" onClick={onCreate}>{t[RSC.MODELS_CREATE_BUTTON]}</Button></Paper>}
    <Box sx={{ display: "grid", gap: .6 }}>{visibleRecords.map(record => {
      const expanded = expandedModels.has(record.id); const detailsId = `model-details-${encodeURIComponent(record.id)}`;
      const agentNames = agentNamesFor(record);
      const toggleDetails = () => setExpandedModels(current => { const next = new Set(current); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; });
      return <Paper component="article" data-testid="model-row" aria-label={record.name} variant="outlined" key={record.id} sx={{ overflow: "hidden", minWidth: 0 }}>
      <Box sx={{ px: 1, py: .45, display: "grid", alignItems: "center", gap: .75, minWidth: 0, flexWrap: "nowrap", overflowX: { xs: "auto", md: "hidden" }, gridTemplateColumns: { xs: "24px 76px 120px 190px minmax(140px, 1fr) auto", sm: "24px 88px 150px 250px minmax(160px, 1fr) auto" } }}>
        <IconButton size="small" aria-label={t[RSC.MODELS_DETAILS_TOGGLE_BUTTON]} aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined} onClick={toggleDetails} sx={{ flex: "0 0 auto" }}><Icon name="chevron" fontSize="small" sx={{ transform: expanded ? "rotate(180deg)" : "none" }} /></IconButton>
        <Chip data-testid="model-row-status" size="small" label={t[stateKeys[record.status]]} color={record.status === "ready" ? "success" : ["failed", "unknown"].includes(record.status) ? "warning" : "default"} sx={{ justifySelf: "start", maxWidth: "100%", height: 21, fontSize: ".68rem", fontWeight: 400, "& .MuiChip-label": { px: .75 } }} />
        <Typography data-testid="model-row-agent" variant="caption" color="text.secondary" aria-label={t[RSC.MODELS_AGENT_LABEL]} title={agentNames} sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".72rem", fontWeight: 400 }}>{agentNames}</Typography>
        <Button data-testid="model-row-name" onClick={() => onOpenModel(record.id)} aria-label={record.name} title={record.name} sx={{ typography: "body2", fontSize: ".78rem", lineHeight: 1.3, fontWeight: 400, width: "100%", justifyContent: "flex-start", minWidth: 0, p: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.primary", textTransform: "none", borderLeft: 1, borderColor: "divider", pl: .75, "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>{record.name}</Button>
        <Typography data-testid="model-row-summary" variant="caption" color="text.secondary" noWrap title={formatMessage(t[RSC.MODELS_SUMMARY_MESSAGE], { adapter: record.adapter, agents: new Set(record.stages.map(s => s.agentId)).size, nodes: record.stages.length, layers: record.totalLayers })} sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".7rem", fontWeight: 400 }}>{formatMessage(t[RSC.MODELS_SUMMARY_MESSAGE], { adapter: record.adapter, agents: new Set(record.stages.map(s => s.agentId)).size, nodes: record.stages.length, layers: record.totalLayers })}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: .25, flex: "0 0 auto" }}>
          {canStartDeployment(record) ? <Button size="small" sx={{ fontSize: ".7rem", fontWeight: 400 }} variant="contained" disabled={activity.busy || !record.stages.length} onClick={() => void deployments.operate(record.id, "load")}>{t[RSC.MODELS_LOAD_BUTTON]}</Button> : <Button size="small" sx={{ fontSize: ".7rem", fontWeight: 400 }} variant="outlined" disabled={activity.busy || ["loading", "unloading"].includes(record.status)} onClick={() => void deployments.operate(record.id, "unload")}>{t[RSC.MODELS_UNLOAD_BUTTON]}</Button>}
          <Tooltip title={t[inspection.modelId === record.id ? RSC.MODELS_INSPECTING_STATUS : RSC.MODELS_INSPECT_BUTTON]}><span><IconButton size="small" aria-label={t[inspection.modelId === record.id ? RSC.MODELS_INSPECTING_STATUS : RSC.MODELS_INSPECT_BUTTON]} disabled={activity.busy || !record.stages.length} onClick={() => void deployments.reconcile(record.id)}><Icon name="refresh" fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={t[RSC.MODELS_EDIT_BUTTON]}><span><IconButton size="small" aria-label={t[RSC.MODELS_EDIT_BUTTON]} disabled={activity.busy || !canStartDeployment(record)} onClick={() => onEdit(record.id)}><Icon name="edit" fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={t[RSC.MODELS_DELETE_BUTTON]}><span><IconButton size="small" aria-label={t[RSC.MODELS_DELETE_BUTTON]} color="secondary" disabled={activity.busy} onClick={() => void deployments.remove(record.id, true)}><Icon name="delete" fontSize="small" /></IconButton></span></Tooltip>
        </Box>
      </Box>
      <Collapse id={detailsId} data-testid="model-row-details" in={expanded} timeout="auto" unmountOnExit>
      <Box sx={{ px: 2, pb: 1.25 }}>
        <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_RECEPTION_MESSAGE]}</Typography>
        {record.sessionProof && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .5 }}>{formatMessage(t[RSC.MODELS_SESSION_PROOF_LABEL], { id: record.sessionProof.sessionId, time: new Date(record.sessionProof.checkedAt).toLocaleString() })}</Typography>}
      </Box>
      {inspection.modelId === record.id && <LinearProgress aria-label={t[RSC.MODELS_INSPECTING_STATUS]} />}
      {record.reports.some(report => report.state === "unknown" && report.observation?.state === "loaded") && <Alert severity="info">{t[RSC.MODELS_INSPECT_GENERATION_MESSAGE]}</Alert>}
      {["loading", "unloading"].includes(record.status) && <LinearProgress aria-label={t[stateKeys[record.status]]} />}
      {record.error && <Alert severity="warning">{record.error}</Alert>}
      <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={record.name} sx={{ minWidth: 780 }}><TableHead><TableRow>
        <TableCell>{t[RSC.MODELS_AGENT_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_NODE_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_LAYERS_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_ARTIFACT_LABEL]}</TableCell><TableCell>{t[RSC.MODELS_REPORT_LABEL]}</TableCell>
      </TableRow></TableHead><TableBody>{record.stages.map(stage => {
        const report = record.reports.find(r => r.stageId === stage.id);
        const agent = stageAgentDisplay(snapshot, record, stage);
        return <TableRow key={stage.id}><TableCell><Typography variant="body2">{agent.name}</Typography>{agent.route && <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>{formatMessage(t[RSC.MODELS_AGENT_ROUTE_LABEL], { address: agent.route })}</Typography>}</TableCell><TableCell><Typography variant="body2">{stage.nodeId}</Typography><Typography variant="caption" color="text.secondary">{t[RSC.MODELS_GENERATION_LABEL]} {stage.nodeGeneration}</Typography></TableCell><TableCell sx={{ whiteSpace: "nowrap" }}>{`[${stage.layerStart}, ${stage.layerEnd})`}</TableCell><TableCell sx={{ maxWidth: 360, overflowWrap: "anywhere" }}>{stage.artifact}</TableCell><TableCell sx={{ minWidth: 172 }}><Typography variant="body2">{t[stateKeys[report?.state ?? "pending"]]}</Typography>{report?.observation && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .25 }}>{formatMessage(t[RSC.MODELS_OBSERVED_MESSAGE], { state: t[report.observation.state === "loaded" ? RSC.MODELS_OBSERVED_LOADED_STATUS : report.observation.state === "missing" ? RSC.MODELS_OBSERVED_MISSING_STATUS : stateKeys[report.observation.state]] })}</Typography>}<Button size="small" aria-label={formatMessage(t[RSC.MODELS_REPORT_DETAIL_ARIA_LABEL], { node: stage.nodeId })} sx={{ mt: .5, px: 0 }} onClick={() => setSelectedReportStageId(stage.id)}>{t[RSC.MODELS_REPORT_DETAIL_BUTTON]}</Button></TableCell></TableRow>;
      })}</TableBody></Table></Box>
      <Box sx={{ px: 2, py: 1.25, color: "text.secondary" }}><Typography variant="caption">{formatMessage(t[RSC.MODELS_COMPLETION_MESSAGE], { ready: record.reports.filter(r => r.state === "ready").length, total: record.stages.length })}</Typography>{record.loadGeneration > 0 && <Typography variant="caption" sx={{ display: "block" }}>{t[RSC.MODELS_LOAD_GENERATION_LABEL]}: {record.loadGeneration}</Typography>}</Box>
      </Collapse>
    </Paper>})}</Box>
    <Dialog open={selectedReport !== undefined} onClose={() => setSelectedReportStageId(null)} fullWidth maxWidth="md" aria-labelledby="model-load-report-title">
      {selectedReport && <><DialogTitle id="model-load-report-title">{formatMessage(t[RSC.MODELS_REPORT_DETAIL_TITLE_TEXT], { node: selectedReport.stage.nodeId })}</DialogTitle><DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        <Box component="section" aria-label={t[RSC.MODELS_REPORT_DETAIL_STATUS_LABEL]} sx={{ display: "grid", gap: .5 }}><Typography variant="overline" color="text.secondary">{t[RSC.MODELS_REPORT_DETAIL_STATUS_LABEL]}</Typography><Typography>{t[stateKeys[selectedReport.report?.state ?? "pending"]]}</Typography>{selectedReport.report?.observation && <Box role="status"><Typography variant="body2">{formatMessage(t[RSC.MODELS_OBSERVED_MESSAGE], { state: t[selectedReport.report.observation.state === "loaded" ? RSC.MODELS_OBSERVED_LOADED_STATUS : selectedReport.report.observation.state === "missing" ? RSC.MODELS_OBSERVED_MISSING_STATUS : stateKeys[selectedReport.report.observation.state]] })}</Typography><Typography variant="caption" color="text.secondary">{formatMessage(t[RSC.MODELS_CHECKED_MESSAGE], { time: new Date(selectedReport.report.observation.checkedAt).toLocaleString() })}</Typography></Box>}</Box>
        {(selectedReport.report?.failureDetail || selectedReport.report?.detail || selectedReport.report?.cleanupError) && <Alert severity="warning">{[selectedReport.report.failureDetail, selectedReport.report.detail, selectedReport.report.cleanupError].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ")}</Alert>}
        {selectedReport.report?.telemetry != null ? <Box component="section" aria-label={t[RSC.MODELS_TELEMETRY_TEXT]}><Typography variant="h2" sx={{ mb: 1 }}>{t[RSC.MODELS_TELEMETRY_TEXT]}</Typography><Box component="pre" dir="ltr" sx={{ m: 0, p: 1.5, maxHeight: "50vh", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, bgcolor: "background.default", borderRadius: 1 }}>{JSON.stringify(selectedReport.report.telemetry, null, 2)}</Box></Box> : <Typography color="text.secondary">{t[RSC.MODELS_REPORT_DETAIL_EMPTY_MESSAGE]}</Typography>}
      </DialogContent><DialogActions><Button onClick={() => setSelectedReportStageId(null)}>{t[RSC.MODELS_PANEL_CLOSE_BUTTON]}</Button></DialogActions></>}
    </Dialog>
  </Box>;
}
