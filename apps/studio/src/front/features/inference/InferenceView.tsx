import { Alert, Box, Button, Chip, MenuItem, Paper, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { deployments, inference } from "@p4studio/studio_domain/front";
import type { DeploymentRecord, InferenceBatch, InferenceMonitoring, InferenceNode, InferenceRequest, InferenceRun, InferenceStageSpan } from "@p4studio/studio_domain/common";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { startModels } from "../models/api.js";
import { startInference } from "./api.js";
import { RSC } from "./resource.js";

const runState: Record<string, RSC> = { preparing: RSC.INFERENCE_PREPARING_STATUS, running: RSC.INFERENCE_RUNNING_STATUS, completed: RSC.INFERENCE_COMPLETED_STATUS, failed: RSC.INFERENCE_FAILED_STATUS, unknown: RSC.INFERENCE_UNKNOWN_STATUS, queued: RSC.INFERENCE_QUEUED_STATUS, streaming: RSC.INFERENCE_STREAMING_STATUS };
const metric = (value: number | null, suffix = "") => value === null ? "—" : `${value.toFixed(2)}${suffix}`;
export function InferenceView({ tab, onTab }: { tab: "query" | "monitoring" | "history"; onTab: (tab: "query" | "monitoring" | "history") => void }) {
  const { t } = useTranslation(); const records = useModel(deployments.records).value; const activity = useModel(inference.activity).value;
  const [modelId, setModelId] = useState(""); const ready = records.filter(record => record.status === "ready" && record.adapter === "llamacpp");
  useEffect(() => { startModels(); startInference(); }, []);
  useEffect(() => { if (!ready.some(record => record.id === modelId)) setModelId(ready[0]?.id ?? ""); }, [modelId, ready]);
  return <Box component="section" aria-label={t[RSC.INFERENCE_TITLE_TEXT]}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 2, mb: 3, flexWrap: "wrap" }}><Box><Typography component="h1" variant="h1">{t[RSC.INFERENCE_TITLE_TEXT]}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_PURPOSE_MESSAGE]}</Typography></Box><Chip label={`${ready.length}`} /></Box>
    <Tabs value={tab} onChange={(_event, value) => onTab(value)} aria-label={t[RSC.INFERENCE_TABS_LABEL]} sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 3 }}><Tab value="query" label={t[RSC.INFERENCE_QUERY_BUTTON]} /><Tab value="monitoring" label={t[RSC.INFERENCE_MONITORING_BUTTON]} /><Tab value="history" label={t[RSC.INFERENCE_HISTORY_BUTTON]} /></Tabs>
    {activity.error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{t[RSC.INFERENCE_ERROR_ALERT]}: {activity.error}</Alert>}
    {tab === "query" ? <QueryPanel modelId={modelId} setModelId={setModelId} ready={ready} /> : tab === "monitoring" ? <MonitoringPanel modelId={modelId} ready={ready} /> : <HistoryPanel />}
  </Box>;
}
function QueryPanel({ modelId, setModelId, ready }: { modelId: string; setModelId: (value: string) => void; ready: DeploymentRecord[] }) {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value; const activity = useModel(inference.activity).value;
  const [prompt, setPrompt] = useState(""); const [concurrency, setConcurrency] = useState(1); const [repetitions, setRepetitions] = useState(1); const [intervalSeconds, setIntervalSeconds] = useState(0); const [maxTokens, setMaxTokens] = useState(256);
  const requests = runs.flatMap(run => run.requests.map(request => ({ run, request })));
  const submit = () => { if (modelId && prompt.trim()) void inference.create({ modelId, prompt, concurrency: concurrency as 1 | 5 | 10 | 20 | 30 | 40, repetitions, intervalMs: intervalSeconds * 1000, maxTokens }); };
  return <Box sx={{ display: "grid", gap: 2.5 }}><Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(4, 1fr)" }, gap: 1.5 }}>
    <TextField required select label={t[RSC.INFERENCE_MODEL_LABEL]} value={modelId} onChange={event => setModelId(event.target.value)}>{ready.map(record => <MenuItem key={record.id} value={record.id}>{record.name}</MenuItem>)}</TextField>
    <TextField select label={t[RSC.INFERENCE_CONCURRENCY_LABEL]} value={concurrency} onChange={event => setConcurrency(Number(event.target.value))}>{[1, 5, 10, 20, 30, 40].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
    <TextField type="number" label={t[RSC.INFERENCE_REPETITIONS_LABEL]} value={repetitions} slotProps={{ htmlInput: { min: 1, max: 1000 } }} onChange={event => setRepetitions(Math.max(1, Number(event.target.value)))} />
    <TextField type="number" label={t[RSC.INFERENCE_INTERVAL_LABEL]} value={intervalSeconds} slotProps={{ htmlInput: { min: 0 } }} onChange={event => setIntervalSeconds(Math.max(0, Number(event.target.value)))} />
    <TextField type="number" label={t[RSC.INFERENCE_MAX_TOKENS_LABEL]} value={maxTokens} slotProps={{ htmlInput: { min: 1 } }} onChange={event => setMaxTokens(Math.max(1, Number(event.target.value)))} />
  </Box><TextField required fullWidth multiline minRows={4} sx={{ mt: 2 }} label={t[RSC.INFERENCE_PROMPT_LABEL]} value={prompt} onChange={event => setPrompt(event.target.value)} /><Box sx={{ display: "flex", justifyContent: "end", mt: 2 }}><Button variant="contained" disabled={activity.busy || !modelId || !prompt.trim()} onClick={submit}>{activity.busy ? t[RSC.INFERENCE_SENDING_STATUS] : t[RSC.INFERENCE_SEND_BUTTON]}</Button></Box></Paper>
  <Paper variant="outlined" sx={{ overflow: "hidden" }}><Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="h2">{t[RSC.INFERENCE_RESULTS_LABEL]}</Typography></Box>{requests.length === 0 ? <Typography color="text.secondary" sx={{ p: 3 }}>{t[RSC.INFERENCE_RESULTS_EMPTY_MESSAGE]}</Typography> : <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={t[RSC.INFERENCE_RESULTS_LABEL]} sx={{ minWidth: 1120 }}><TableHead><TableRow><TableCell>{t[RSC.INFERENCE_REQUEST_LABEL]}</TableCell><TableCell>{t[RSC.INFERENCE_STATE_LABEL]}</TableCell><TableCell>{t[RSC.INFERENCE_OUTPUT_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_TOKENS_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_PREFILL_TPS_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_GENERATION_TPS_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_TTFT_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_FINAL_TPS_LABEL]}</TableCell></TableRow></TableHead><TableBody>{requests.map(({ run, request }) => <RequestRow key={request.id} runName={run.modelName} request={request} />)}</TableBody></Table></Box>}</Paper></Box>;
}
function RequestRow({ runName, request }: { runName: string; request: InferenceRequest }) { const { t } = useTranslation(); const state = request.state ?? "unknown", stateKey = runState[state] ?? RSC.INFERENCE_UNKNOWN_STATUS; return <TableRow><TableCell><Typography variant="body2">{request.id}</Typography><Typography variant="caption" color="text.secondary">{runName}</Typography></TableCell><TableCell><Chip size="small" label={t[stateKey]} color={state === "completed" ? "success" : ["failed", "unknown"].includes(state) ? "warning" : "default"} /></TableCell><TableCell sx={{ minWidth: 300, maxWidth: 440, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.text || request.error || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</TableCell><TableCell align="right">{request.receivedTokens}</TableCell><TableCell align="right">{metric(request.prefillTps)}</TableCell><TableCell align="right">{metric(request.generationTps)}</TableCell><TableCell align="right">{metric(request.ttftMs, " ms")}</TableCell><TableCell align="right">{metric(request.finalTps)}</TableCell></TableRow>; }

function BatchDetail({ batch }: { batch: InferenceBatch }) {
  const { t } = useTranslation();
  return <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_BATCH_LABEL]}</Typography>
    <Typography sx={{ mt: .5 }}>{formatMessage(t[RSC.INFERENCE_BATCH_ROWS_TEXT], { ordinal: batch.logicalOrdinal, rows: batch.rows, physical: batch.physicalBatchCount })}</Typography>
    <Typography variant="body2" color="text.secondary">{formatMessage(t[RSC.INFERENCE_BATCH_PHASES_TEXT], { prefill: batch.prefillRows, decode: batch.decodeRows, verify: batch.verifyRows, replay: batch.replayRows })}</Typography>
    <Typography variant="body2" color="text.secondary">{formatMessage(t[RSC.INFERENCE_BATCH_WORK_TEXT], { requests: batch.requestCount, sequences: batch.sequenceCount, readyRows: batch.readyRows, readySequences: batch.readySequences })}</Typography>
    <Typography variant="body2" color="text.secondary">{formatMessage(t[RSC.INFERENCE_BATCH_TIMING_TEXT], { stage: batch.stageMs, idle: batch.idleMs, gated: batch.idleGated })}</Typography>
  </Paper>;
}

function SpanDetail({ span }: { span: InferenceStageSpan }) {
  const { t } = useTranslation();
  return <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_SPAN_LABEL]}</Typography>
    <Typography sx={{ mt: .5 }}>{formatMessage(t[RSC.INFERENCE_SPAN_WORK_TEXT], { executions: span.executionCount, rows: span.rows })}</Typography>
    <Typography variant="body2" color="text.secondary">{formatMessage(t[RSC.INFERENCE_SPAN_TIMING_TEXT], { stage: span.stageDurationMs, total: span.totalDurationMs })}</Typography>
  </Paper>;
}

function MonitoringNodeCard({ node, compact = false }: { node: InferenceNode; compact?: boolean }) {
  const { t } = useTranslation(); const available = node.observationState === "available", stateKey = runState[available ? "running" : "unknown"] ?? RSC.INFERENCE_UNKNOWN_STATUS;
  return <Paper component="article" variant="outlined" sx={{ overflow: "hidden" }}><Box sx={{ p: 2, display: "flex", gap: 2, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}><Box><Typography variant="h2">{t[RSC.INFERENCE_STAGE_LABEL]} {node.stageIndex + 1}</Typography><Typography variant="body2" color="text.secondary">{t[RSC.INFERENCE_AGENT_LABEL]} · {node.agentName} · {t[RSC.INFERENCE_NODE_LABEL]} · {node.nodeId}</Typography></Box><Chip label={t[stateKey]} color={available ? "success" : "warning"} /></Box>
    {node.error && <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>{t[RSC.INFERENCE_MONITORING_ERROR_ALERT]}: {node.error}</Alert>}
    <Box sx={{ p: 2, pt: 0, display: "grid", gridTemplateColumns: compact ? "1fr" : { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_NODE_STATE_LABEL]}</Typography><Typography sx={{ mt: .5, overflowWrap: "anywhere" }}>{node.adapterState === null ? t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT] : JSON.stringify(node.adapterState)}</Typography></Paper>
      {node.latestBatch && <BatchDetail batch={node.latestBatch} />}{node.latestSpan && <SpanDetail span={node.latestSpan} />}
      {node.gpus.map(gpu => <Paper variant="outlined" sx={{ p: 1.5 }} key={gpu.index}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_GPU_LABEL]} {gpu.index} · {gpu.name}</Typography><Typography sx={{ mt: .5 }}>{t[RSC.INFERENCE_VRAM_LABEL]}: {formatMessage(t[RSC.INFERENCE_MIB_TEXT], { used: Math.round(gpu.vramUsedBytes / 1024 / 1024), total: Math.round((gpu.vramUsedBytes + gpu.vramFreeBytes) / 1024 / 1024) })}</Typography><Typography variant="body2" color="text.secondary">{t[RSC.INFERENCE_UTILIZATION_LABEL]}: {metric(gpu.utilizationGpuPercent, "%")}</Typography></Paper>)}
    </Box></Paper>;
}

function MonitoringPanel({ modelId, ready }: { modelId: string; ready: DeploymentRecord[] }) {
  const { t } = useTranslation(); const snapshot = useModel(inference.monitoring).value;
  useEffect(() => { if (!modelId) return; void inference.refreshMonitoring(modelId); const timer = setInterval(() => void inference.refreshMonitoring(modelId), 2000); return () => clearInterval(timer); }, [modelId]);
  return <Box sx={{ display: "grid", gap: 2 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Typography color="text.secondary">{t[RSC.INFERENCE_MONITORING_PURPOSE_MESSAGE]}</Typography><Button onClick={() => modelId && void inference.refreshMonitoring(modelId)}>{t[RSC.INFERENCE_REFRESH_BUTTON]}</Button></Box>{!modelId || !ready.length || !snapshot || snapshot.modelId !== modelId ? <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_MONITORING_EMPTY_MESSAGE]}</Typography></Paper> : snapshot.nodes.map(node => <MonitoringNodeCard key={`${node.stageIndex}-${node.agentId}-${node.nodeId}`} node={node} />)}</Box>;
}

function MonitoringTimeline({ snapshots }: { snapshots: InferenceMonitoring[] }) {
  const { t } = useTranslation();
  if (snapshots.length === 0) return <Typography color="text.secondary" sx={{ p: 3 }}>{t[RSC.INFERENCE_HISTORY_MONITORING_EMPTY_MESSAGE]}</Typography>;
  return <Box sx={{ display: "grid", gap: 1.5, p: 2 }}>{snapshots.map((snapshot, index) => <Paper variant="outlined" key={`${snapshot.generatedAt}-${index}`} sx={{ p: 1.5 }}><Typography variant="body2" color="text.secondary">{new Date(snapshot.generatedAt).toLocaleString()}</Typography><Typography sx={{ mt: .5, mb: 1 }}>{formatMessage(t[RSC.INFERENCE_HISTORY_SNAPSHOT_TEXT], { nodes: snapshot.nodes.length, available: snapshot.nodes.filter(node => node.observationState === "available").length })}</Typography><Box sx={{ display: "grid", gap: 1 }}>{snapshot.nodes.filter(node => node.latestBatch || node.latestSpan).map(node => <MonitoringNodeCard compact key={`${node.stageIndex}-${node.agentId}-${node.nodeId}`} node={node} />)}</Box></Paper>)}</Box>;
}

function HistoryPanel() {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value; const [selectedId, setSelectedId] = useState<string | null>(runs[0]?.id ?? null);
  useEffect(() => { if (!selectedId || !runs.some(run => run.id === selectedId)) setSelectedId(runs[0]?.id ?? null); }, [runs, selectedId]);
  const selected = runs.find(run => run.id === selectedId) ?? null;
  return <Box sx={{ display: "grid", gap: 2 }}><Box><Typography variant="h2">{t[RSC.INFERENCE_HISTORY_DETAIL_LABEL]}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_PURPOSE_MESSAGE]}</Typography></Box>{runs.length === 0 ? <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_HISTORY_EMPTY_MESSAGE]}</Typography></Paper> : <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(280px, .8fr) minmax(0, 2fr)" }, gap: 2, alignItems: "start" }}><Paper component="nav" variant="outlined" aria-label={t[RSC.INFERENCE_HISTORY_LIST_LABEL]} sx={{ overflow: "hidden" }}><Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="h2">{t[RSC.INFERENCE_HISTORY_LIST_LABEL]}</Typography></Box>{runs.map(run => <Button key={run.id} fullWidth onClick={() => setSelectedId(run.id)} sx={{ justifyContent: "start", textAlign: "start", borderRadius: 0, p: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: run.id === selectedId ? "action.selected" : "transparent" }}><Box sx={{ minWidth: 0, width: "100%" }}><Typography noWrap>{run.modelName}</Typography><Typography variant="caption" color="text.secondary" noWrap>{new Date(run.createdAt).toLocaleString()}</Typography><Box sx={{ mt: .5 }}><Chip size="small" label={t[runState[run.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} /></Box></Box></Button>)}</Paper>{selected && <HistoryDetail run={selected} />}</Box>}</Box>;
}

function HistoryDetail({ run }: { run: InferenceRun }) {
  const { t } = useTranslation(); const requests = run.requests.map(request => ({ run, request }));
  return <Box sx={{ display: "grid", gap: 2 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h2">{run.modelName}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}: {new Date(run.createdAt).toLocaleString()}</Typography><Typography variant="body2" sx={{ mt: 1 }}>{t[RSC.INFERENCE_HISTORY_REQUESTS_LABEL]}: {run.submitted} · {run.completed}</Typography>{run.error && <Alert severity="warning" sx={{ mt: 1 }}>{run.error}</Alert>}</Paper><Paper variant="outlined" sx={{ overflow: "hidden" }}><Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="h2">{t[RSC.INFERENCE_RESULTS_LABEL]}</Typography></Box>{requests.length === 0 ? <Typography color="text.secondary" sx={{ p: 3 }}>{t[RSC.INFERENCE_RESULTS_EMPTY_MESSAGE]}</Typography> : <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={t[RSC.INFERENCE_RESULTS_LABEL]} sx={{ minWidth: 1120 }}><TableHead><TableRow><TableCell>{t[RSC.INFERENCE_REQUEST_LABEL]}</TableCell><TableCell>{t[RSC.INFERENCE_STATE_LABEL]}</TableCell><TableCell>{t[RSC.INFERENCE_OUTPUT_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_TOKENS_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_FINAL_TPS_LABEL]}</TableCell></TableRow></TableHead><TableBody>{requests.map(({ request }) => <TableRow key={request.id}><TableCell>{request.id}</TableCell><TableCell><Chip size="small" label={t[runState[request.state ?? "unknown"] ?? RSC.INFERENCE_UNKNOWN_STATUS]} /></TableCell><TableCell sx={{ minWidth: 300, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.text || request.error || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</TableCell><TableCell align="right">{request.receivedTokens}</TableCell><TableCell align="right">{metric(request.finalTps)}</TableCell></TableRow>)}</TableBody></Table></Box>}</Paper><Paper variant="outlined" sx={{ overflow: "hidden" }}><Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="h2">{t[RSC.INFERENCE_HISTORY_MONITORING_LABEL]}</Typography></Box><MonitoringTimeline snapshots={run.monitoring} /></Paper></Box>;
}
