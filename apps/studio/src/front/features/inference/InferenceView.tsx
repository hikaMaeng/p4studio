import { Alert, Box, Button, Chip, MenuItem, Paper, Tab, Tabs, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { lazy, Suspense, useEffect, useState, type KeyboardEvent } from "react";
import { deployments, inference, monitoringSummaryFor, requestMetrics, waveMetrics } from "@p4studio/studio_domain/front";
import { canAttemptInference, llamaDispatchLimits, type DeploymentRecord, type InferenceMonitoringSummary, type InferenceNode, type InferenceRequest, type InferenceRun } from "@p4studio/studio_domain/common";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { startModels } from "../models/api.js";
import { startInference } from "./api.js";
import { RSC } from "./resource.js";
import { RequestMonitoringContent, RequestPerformanceMetrics, RunObservability } from "./InferenceObservability.js";
import { paginateResults } from "./pagination.js";

const runState: Record<string, RSC> = { preparing: RSC.INFERENCE_PREPARING_STATUS, running: RSC.INFERENCE_RUNNING_STATUS, completed: RSC.INFERENCE_COMPLETED_STATUS, failed: RSC.INFERENCE_FAILED_STATUS, unknown: RSC.INFERENCE_UNKNOWN_STATUS, queued: RSC.INFERENCE_QUEUED_STATUS, streaming: RSC.INFERENCE_STREAMING_STATUS };
const metric = (value: number | null, suffix = "") => value === null ? "—" : `${value.toFixed(2)}${suffix}`;
const maxInferenceRepetitions = 1000;
const MarkdownRenderer = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([import("react-markdown"), import("remark-gfm")]);
  return { default: ({ children }: { children: string }) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown> };
});
export function InferenceView({ tab, historyRunId, requestId, onTab, onOpenHistory, onBackHistory, onOpenRequest, onBackRequest }: { tab: "query" | "monitoring" | "history"; historyRunId?: string; requestId?: string; onTab: (tab: "query" | "monitoring" | "history") => void; onOpenHistory: (runId: string) => void; onBackHistory: () => void; onOpenRequest: (requestId: string) => void; onBackRequest: () => void }) {
  const { t } = useTranslation(); const records = useModel(deployments.records).value; const activity = useModel(inference.activity).value;
  const [modelId, setModelId] = useState(""); const ready = records.filter(record => record.adapter === "llamacpp" && canAttemptInference(record));
  useEffect(() => { startModels(); startInference(); }, []);
  useEffect(() => { if (!ready.some(record => record.id === modelId)) setModelId(ready[0]?.id ?? ""); }, [modelId, ready]);
  return <Box component="section" aria-label={t[RSC.INFERENCE_TITLE_TEXT]}>
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 2, mb: 3, flexWrap: "wrap" }}><Box><Typography component="h1" variant="h1">{t[RSC.INFERENCE_TITLE_TEXT]}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_PURPOSE_MESSAGE]}</Typography></Box><Chip label={`${ready.length}`} /></Box>
    <Tabs value={tab} onChange={(_event, value) => onTab(value)} aria-label={t[RSC.INFERENCE_TABS_LABEL]} sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 3 }}><Tab value="query" label={t[RSC.INFERENCE_QUERY_BUTTON]} /><Tab value="monitoring" label={t[RSC.INFERENCE_MONITORING_BUTTON]} /><Tab value="history" label={t[RSC.INFERENCE_HISTORY_BUTTON]} /></Tabs>
    {activity.error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{t[RSC.INFERENCE_ERROR_ALERT]}: {activity.error}</Alert>}
    {tab === "query" ? <QueryPanel modelId={modelId} setModelId={setModelId} ready={ready} requestId={requestId} onOpenRequest={onOpenRequest} onBackRequest={onBackRequest} /> : tab === "monitoring" ? <MonitoringPanel modelId={modelId} ready={ready} /> : historyRunId ? <HistoryDetailPage runId={historyRunId} onBack={onBackHistory} /> : <HistoryListPage onOpen={onOpenHistory} />}
  </Box>;
}
function QueryPanel({ modelId, setModelId, ready, requestId, onOpenRequest, onBackRequest }: { modelId: string; setModelId: (value: string) => void; ready: DeploymentRecord[]; requestId?: string; onOpenRequest: (requestId: string) => void; onBackRequest: () => void }) {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value; const activity = useModel(inference.activity).value;
  const [prompt, setPrompt] = useState(""); const [concurrency, setConcurrency] = useState(1); const [repetitions, setRepetitions] = useState(1); const [intervalSeconds, setIntervalSeconds] = useState(0); const [maxTokens, setMaxTokens] = useState(512);
  const selected = ready.find(record => record.id === modelId); const limits = selected ? llamaDispatchLimits(selected.stages) : null;
  const maxConcurrency = limits?.maxRequests ?? 1;
  const maxRepetitions = maxInferenceRepetitions;
  useEffect(() => { setConcurrency(value => Math.min(value, maxConcurrency)); setRepetitions(value => Math.min(value, maxRepetitions)); }, [maxConcurrency, maxRepetitions]);
  const requests = runs.flatMap(run => run.requests.map(request => ({ run, request })));
  const activeRuns = runs.filter(run => run.modelId === modelId && ["preparing", "running"].includes(run.state));
  const submit = () => { if (modelId && prompt.trim()) void inference.create({ modelId, prompt, concurrency, repetitions, intervalMs: intervalSeconds * 1000, maxTokens }); };
  return <Box sx={{ display: "grid", gap: 2.5, minWidth: 0 }}><Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(4, 1fr)" }, gap: 1.5 }}>
    <TextField required select label={t[RSC.INFERENCE_MODEL_LABEL]} value={modelId} onChange={event => setModelId(event.target.value)}>{ready.map(record => <MenuItem key={record.id} value={record.id}>{record.name}</MenuItem>)}</TextField>
    <TextField type="number" label={t[RSC.INFERENCE_CONCURRENCY_LABEL]} value={concurrency} slotProps={{ htmlInput: { min: 1, max: maxConcurrency } }} onChange={event => setConcurrency(Math.min(maxConcurrency, Math.max(1, Number(event.target.value))))} />
    <TextField type="number" label={t[RSC.INFERENCE_REPETITIONS_LABEL]} value={repetitions} slotProps={{ htmlInput: { min: 1, max: maxRepetitions } }} onChange={event => setRepetitions(Math.min(maxRepetitions, Math.max(1, Number(event.target.value))))} />
    <TextField type="number" label={t[RSC.INFERENCE_INTERVAL_LABEL]} value={intervalSeconds} slotProps={{ htmlInput: { min: 0 } }} onChange={event => setIntervalSeconds(Math.max(0, Number(event.target.value)))} />
    <TextField type="number" label={t[RSC.INFERENCE_MAX_TOKENS_LABEL]} value={maxTokens} helperText={formatMessage(t[RSC.INFERENCE_MAX_TOKENS_HELPER], { limit: limits?.maxOutputTokensPerRequest ?? 0 })} slotProps={{ htmlInput: { min: 1, max: limits?.maxOutputTokensPerRequest ?? 1 } }} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value)) setMaxTokens(Math.min(limits?.maxOutputTokensPerRequest ?? 1, Math.max(1, value))); }} />
  </Box><TextField required fullWidth multiline minRows={4} sx={{ mt: 2 }} label={t[RSC.INFERENCE_PROMPT_LABEL]} value={prompt} onChange={event => setPrompt(event.target.value)} /><Box sx={{ display: "flex", justifyContent: "end", mt: 2 }}><Button variant="contained" disabled={activity.busy || !modelId || !prompt.trim()} onClick={submit}>{activity.busy ? t[RSC.INFERENCE_SENDING_STATUS] : t[RSC.INFERENCE_SEND_BUTTON]}</Button></Box></Paper>
  {activeRuns.map(run => <RunMonitoringSummary key={run.id} run={run} />)}
  {requestId ? <RequestDetailPage requestId={requestId} onBack={onBackRequest} /> : <RequestTable requests={requests} onOpen={onOpenRequest} />}
  </Box>;
}
const resultCellSx = { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" };
const metricCellSx = { ...resultCellSx, px: { xs: .5, sm: 1 }, fontVariantNumeric: "tabular-nums", textAlign: "right" };

const elapsed = (request: InferenceRequest) => request.completedAt ? Date.parse(request.completedAt) - Date.parse(request.submittedAt) : null;

function RequestRow({ run, request, onOpen }: { run: InferenceRun; request: InferenceRequest; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation(); const state = request.state ?? "unknown", stateKey = runState[state] ?? RSC.INFERENCE_UNKNOWN_STATUS;
  const open = () => onOpen?.(request.id);
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => { if (onOpen && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); } };
  return <TableRow data-testid="inference-request-row" hover={Boolean(onOpen)} onClick={onOpen ? open : undefined} onKeyDown={onOpen ? onKeyDown : undefined} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} sx={{ "& > *": { py: 1, whiteSpace: "nowrap" }, ...(onOpen ? { cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } } : {}) }}><TableCell sx={resultCellSx}><Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>{request.id}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 150 }}>{run.modelName}</Typography></TableCell><TableCell sx={resultCellSx}><Chip size="small" label={t[stateKey]} color={state === "completed" ? "success" : ["failed", "unknown"].includes(state) ? "warning" : "default"} /></TableCell><TableCell sx={{ ...resultCellSx, maxWidth: 0 }}><Typography noWrap title={request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}>{request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></TableCell><TableCell align="right" sx={metricCellSx}>{metric(request.ttftMs, " ms")}</TableCell><TableCell align="right" sx={metricCellSx}>{metric(request.finalTps)}</TableCell><TableCell align="right" sx={metricCellSx}>{metric(elapsed(request), " ms")}</TableCell><TableCell align="right" sx={metricCellSx}>{new Date(request.submittedAt).toLocaleString()}</TableCell></TableRow>;
}

function RequestTable({ requests, onOpen }: { requests: Array<{ run: InferenceRun; request: InferenceRequest }>; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation(); const [page, setPage] = useState(0); const { page: currentPage, pageCount, items: pageRequests } = paginateResults(requests, page);
  const headerCellSx = { ...resultCellSx, px: { xs: .5, sm: 1 }, whiteSpace: "nowrap", fontSize: "0.75rem", lineHeight: 1.25 };
  return <Paper variant="outlined" sx={{ overflow: "hidden", minWidth: 0 }}><Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="h2">{t[RSC.INFERENCE_RESULTS_LABEL]}</Typography></Box>{requests.length === 0 ? <Typography color="text.secondary" sx={{ p: 3 }}>{t[RSC.INFERENCE_RESULTS_EMPTY_MESSAGE]}</Typography> : <><Box sx={{ minWidth: 0, overflowX: "auto" }}><Table size="small" aria-label={t[RSC.INFERENCE_RESULTS_LABEL]} sx={{ minWidth: 1120, width: "100%", tableLayout: "fixed" }}><colgroup><col style={{ width: "17%" }} /><col style={{ width: "10%" }} /><col style={{ width: "auto" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} /><col style={{ width: "15%" }} /></colgroup><TableHead><TableRow><TableCell sx={headerCellSx}>{t[RSC.INFERENCE_REQUEST_LABEL]}</TableCell><TableCell sx={headerCellSx}>{t[RSC.INFERENCE_STATE_LABEL]}</TableCell><TableCell sx={headerCellSx}>{t[RSC.INFERENCE_QUESTION_LABEL]}</TableCell><TableCell align="right" sx={headerCellSx}>{t[RSC.INFERENCE_TTFT_LABEL]}</TableCell><TableCell align="right" sx={headerCellSx}>{t[RSC.INFERENCE_FINAL_TPS_LABEL]}</TableCell><TableCell align="right" sx={headerCellSx}>{t[RSC.INFERENCE_REQUEST_MONITORING_E2E_LABEL]}</TableCell><TableCell align="right" sx={headerCellSx}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}</TableCell></TableRow></TableHead><TableBody>{pageRequests.map(({ run, request }) => <RequestRow key={request.id} run={run} request={request} onOpen={onOpen} />)}</TableBody></Table></Box><Box sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "end", alignItems: "center", gap: 1 }}><Button size="small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t[RSC.INFERENCE_PAGINATION_PREVIOUS_BUTTON]}</Button><Typography variant="caption">{formatMessage(t[RSC.INFERENCE_PAGINATION_PAGE_TEXT], { page: currentPage + 1, pages: pageCount })}</Typography><Button size="small" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t[RSC.INFERENCE_PAGINATION_NEXT_BUTTON]}</Button></Box></>}</Paper>;
}

function MonitoringNodeCard({ node }: { node: InferenceNode }) {
  const { t } = useTranslation(); const available = node.observationState === "available", stateKey = runState[available ? "running" : "unknown"] ?? RSC.INFERENCE_UNKNOWN_STATUS;
  return <Paper component="article" variant="outlined" sx={{ overflow: "hidden" }}><Box sx={{ p: 2, display: "flex", gap: 2, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}><Box><Typography variant="h2">{t[RSC.INFERENCE_STAGE_LABEL]} {node.stageIndex + 1}</Typography><Typography variant="body2" color="text.secondary">{t[RSC.INFERENCE_AGENT_LABEL]} · {node.agentName} · {t[RSC.INFERENCE_NODE_LABEL]} · {node.nodeId}</Typography></Box><Chip label={t[stateKey]} color={available ? "success" : "warning"} /></Box>
    {node.error && <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>{t[RSC.INFERENCE_MONITORING_ERROR_ALERT]}: {node.error}</Alert>}
    <Box sx={{ p: 2, pt: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_NODE_STATE_LABEL]}</Typography><Typography sx={{ mt: .5, overflowWrap: "anywhere" }}>{node.adapterState === null ? t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT] : JSON.stringify(node.adapterState)}</Typography></Paper>
      {node.gpus.map(gpu => <Paper variant="outlined" sx={{ p: 1.5 }} key={gpu.index}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_GPU_LABEL]} {gpu.index} · {gpu.name}</Typography><Typography sx={{ mt: .5 }}>{t[RSC.INFERENCE_VRAM_LABEL]}: {formatMessage(t[RSC.INFERENCE_MIB_TEXT], { used: Math.round(gpu.vramUsedBytes / 1024 / 1024), total: Math.round((gpu.vramUsedBytes + gpu.vramFreeBytes) / 1024 / 1024) })}</Typography><Typography variant="body2" color="text.secondary">{t[RSC.INFERENCE_UTILIZATION_LABEL]}: {metric(gpu.utilizationGpuPercent, "%")}</Typography></Paper>)}
    </Box></Paper>;
}

function MonitoringPanel({ modelId, ready }: { modelId: string; ready: DeploymentRecord[] }) {
  const { t } = useTranslation(); const snapshot = useModel(inference.monitoring).value; const runs = useModel(inference.runs).value;
  const activeRuns = runs.filter(run => run.modelId === modelId && ["preparing", "running"].includes(run.state));
  useEffect(() => { if (!modelId) return; void inference.refreshMonitoring(modelId); const timer = setInterval(() => void inference.refreshMonitoring(modelId), 2000); return () => clearInterval(timer); }, [modelId]);
  const hasSnapshot = modelId && ready.length && snapshot?.modelId === modelId;
  return <Box sx={{ display: "grid", gap: 2 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Typography color="text.secondary">{t[RSC.INFERENCE_MONITORING_PURPOSE_MESSAGE]}</Typography><Button onClick={() => modelId && void inference.refreshMonitoring(modelId)}>{t[RSC.INFERENCE_REFRESH_BUTTON]}</Button></Box>
    <Box component="section" aria-label={t[RSC.INFERENCE_ACTIVE_RUNS_LABEL]} sx={{ display: "grid", gap: 1.5 }}><Typography variant="h2">{t[RSC.INFERENCE_ACTIVE_RUNS_LABEL]}</Typography>{activeRuns.length ? activeRuns.map(run => <RunMonitoringSummary key={run.id} run={run} />) : <Paper variant="outlined" sx={{ p: 2 }}><Typography color="text.secondary">{t[RSC.INFERENCE_ACTIVE_RUNS_EMPTY_MESSAGE]}</Typography></Paper>}</Box>
    {!hasSnapshot ? <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_MONITORING_EMPTY_MESSAGE]}</Typography></Paper> : <Box component="section" aria-label={t[RSC.INFERENCE_NODE_HEALTH_LABEL]} sx={{ display: "grid", gap: 1.5 }}><Typography variant="h2">{t[RSC.INFERENCE_NODE_HEALTH_LABEL]}</Typography>{snapshot.nodes.map(node => <MonitoringNodeCard key={`${node.stageIndex}-${node.agentId}-${node.nodeId}`} node={node} />)}</Box>}
  </Box>;
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ mt: .25, fontWeight: 600 }}>{value}</Typography></Box>;
}

function SummaryOverview({ run, summary }: { run: InferenceRun; summary: InferenceMonitoringSummary }) {
  const { t } = useTranslation(); const performance = requestMetrics(run);
  const rows = summary.stages.reduce((sum, stage) => sum + stage.rows, 0);
  return <Box data-testid="inference-run-summary" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2 }}>
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_PROGRESS_LABEL]} value={`${run.completed} / ${run.submitted}`} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TOKENS_LABEL]} value={performance.totalTokens} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P50_LABEL]} value={metric(performance.ttftP50Ms, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P95_LABEL]} value={metric(performance.ttftP95Ms, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_MAX_LABEL]} value={metric(performance.ttftMaxMs, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_FINAL_TPS_P50_LABEL]} value={metric(performance.finalTpsP50)} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_EVENTS_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_EVENTS_TEXT], { batches: summary.batchObservations, spans: summary.stageSpans })} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_ROWS_LABEL]} value={rows} />
  </Box>;
}

function WaveSummary({ run }: { run: InferenceRun }) {
  const { t } = useTranslation(); const waves = waveMetrics(run);
  return <Box component="section" data-testid="inference-wave-summary" aria-label={t[RSC.INFERENCE_WAVE_SUMMARY_LABEL]} sx={{ display: "grid", gap: 1 }}><Typography variant="h2">{t[RSC.INFERENCE_WAVE_SUMMARY_LABEL]}</Typography>
    {waves.length === 0 ? <Typography color="text.secondary">{t[RSC.INFERENCE_WAVE_SUMMARY_UNAVAILABLE_MESSAGE]}</Typography> : waves.map(wave => <Paper data-testid="inference-wave-row" variant="outlined" key={wave.waveIndex} sx={{ p: 1.5 }}>
      <Typography sx={{ fontWeight: 600 }}>{formatMessage(t[RSC.INFERENCE_WAVE_SUMMARY_WAVE_TEXT], { wave: wave.waveIndex })}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }, gap: 1.5, mt: 1 }}>
        <SummaryMetric label={t[RSC.INFERENCE_WAVE_SUMMARY_SENT_LABEL]} value={wave.sentAt ? new Date(wave.sentAt).toLocaleString() : t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]} />
        <SummaryMetric label={t[RSC.INFERENCE_WAVE_SUMMARY_PROGRESS_LABEL]} value={`${wave.completed} / ${wave.submitted}`} />
        <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P50_LABEL]} value={metric(wave.ttftP50Ms, " ms")} />
        <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P95_LABEL]} value={metric(wave.ttftP95Ms, " ms")} />
        <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_MAX_LABEL]} value={metric(wave.ttftMaxMs, " ms")} />
      </Box>
    </Paper>)}
  </Box>;
}

function StageSummary({ summary }: { summary: InferenceMonitoringSummary }) {
  const { t } = useTranslation();
  if (!summary.stages.some(stage => stage.batchObservations || stage.stageSpans)) return <Typography color="text.secondary">{t[RSC.INFERENCE_SUMMARY_EMPTY_MESSAGE]}</Typography>;
  return <Box component="section" aria-label={t[RSC.INFERENCE_STAGE_SUMMARY_LABEL]} sx={{ display: "grid", gap: 1 }}><Typography variant="h2">{t[RSC.INFERENCE_STAGE_SUMMARY_LABEL]}</Typography>{summary.stages.filter(stage => stage.batchObservations || stage.stageSpans).map(stage => <Paper data-testid="inference-stage-summary" variant="outlined" key={`${stage.stageIndex}-${stage.nodeId}`} sx={{ p: 1.5 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Typography sx={{ fontWeight: 600 }}>{t[RSC.INFERENCE_STAGE_LABEL]} {stage.stageIndex + 1} · {stage.agentName} · {stage.nodeId}</Typography><Typography variant="caption" color="text.secondary">{stage.lastObservedAt ? new Date(stage.lastObservedAt).toLocaleString() : t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></Box>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }, gap: 1.5, mt: 1 }}>
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_EVENTS_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_EVENTS_TEXT], { batches: stage.batchObservations, spans: stage.stageSpans })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_PHASES_LABEL]} value={formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_PHASES_TEXT], { prefill: stage.prefillRows, decode: stage.decodeRows, verify: stage.verifyRows, replay: stage.replayRows })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_BATCHES_LABEL]} value={formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_BATCHES_TEXT], { physical: stage.physicalBatches, mixed: stage.mixedPhysicalBatches, executions: stage.executionCount, rows: stage.rows, readyRows: stage.maxReadyRows, readySequences: stage.maxReadySequences })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_TIMING_LABEL]} value={formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_TIMING_TEXT], { batch: stage.batchStageMs, idle: stage.idleMs, initialIdle: stage.initialIdleMs, gated: stage.idleGated, span: stage.spanStageMs, total: stage.spanTotalMs })} />
    </Box>
  </Paper>)}</Box>;
}

function RunMonitoringSummary({ run }: { run: InferenceRun }) {
  const { t } = useTranslation(); const summary = monitoringSummaryFor(run);
  return <Paper component="article" data-testid="inference-monitoring-summary" variant="outlined" sx={{ p: 2 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2 }}><Box><Typography variant="h2">{run.modelName}</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{run.id}</Typography></Box><Chip size="small" label={t[runState[run.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={run.state === "running" ? "success" : "default"} /></Box><SummaryOverview run={run} summary={summary} /><Box sx={{ mt: 2 }}><RunObservability run={run} /></Box><Box sx={{ mt: 2 }}><WaveSummary run={run} /></Box><Box sx={{ mt: 2 }}><StageSummary summary={summary} /></Box></Paper>;
}

function HistoryListPage({ onOpen }: { onOpen: (runId: string) => void }) {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value;
  return <Box sx={{ display: "grid", gap: 2 }}><Box><Typography variant="h2">{t[RSC.INFERENCE_HISTORY_LIST_LABEL]}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_PURPOSE_MESSAGE]}</Typography></Box>{runs.length === 0 ? <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_HISTORY_EMPTY_MESSAGE]}</Typography></Paper> : <Box component="section" aria-label={t[RSC.INFERENCE_HISTORY_LIST_LABEL]} sx={{ display: "grid", gap: 1.5 }}>{runs.map(run => { const summary = monitoringSummaryFor(run); const question = run.requests[0]?.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]; return <Paper component="article" data-testid="inference-history-row" key={run.id} variant="outlined" sx={{ p: 2 }}><Box sx={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Box sx={{ minWidth: 0 }}><Typography>{run.modelName}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>{run.id}</Typography><Typography variant="caption" color="text.secondary">{new Date(run.createdAt).toLocaleString()}</Typography><Box sx={{ mt: .75 }}><Chip size="small" label={t[runState[run.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} /></Box></Box><Button onClick={() => onOpen(run.id)}>{t[RSC.INFERENCE_HISTORY_OPEN_BUTTON]}</Button></Box><Box sx={{ mt: 1.5 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_QUESTION_LABEL]}</Typography><Typography data-testid="inference-history-question" sx={{ mt: .25, lineHeight: 1.4, overflowWrap: "anywhere", overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}>{question}</Typography></Box><Box sx={{ mt: 2 }}><SummaryOverview run={run} summary={summary} /></Box></Paper>; })}</Box>}</Box>;
}

function HistoryDetailPage({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value; const run = runs.find(candidate => candidate.id === runId) ?? null;
  return <Box data-testid="inference-history-detail" sx={{ display: "grid", gap: 2 }}><Box><Button onClick={onBack}>{t[RSC.INFERENCE_HISTORY_BACK_BUTTON]}</Button><Typography variant="h2" sx={{ mt: 1 }}>{t[RSC.INFERENCE_HISTORY_DETAIL_LABEL]}</Typography></Box>{run ? <HistoryDetail run={run} /> : <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_HISTORY_NOT_FOUND_MESSAGE]}</Typography></Paper>}</Box>;
}

function HistoryDetail({ run }: { run: InferenceRun }) {
  const { t } = useTranslation(); const requests = run.requests.map(request => ({ run, request })); const summary = monitoringSummaryFor(run);
  return <Box sx={{ display: "grid", gap: 2 }}><Paper variant="outlined" sx={{ p: 2 }}><Typography variant="h2">{run.modelName}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}: {new Date(run.createdAt).toLocaleString()}</Typography><Box sx={{ mt: 2 }}><SummaryOverview run={run} summary={summary} /></Box>{run.error && <Alert severity="warning" sx={{ mt: 1 }}>{run.error}</Alert>}</Paper><RunObservability run={run} /><Paper variant="outlined" sx={{ p: 2 }}><WaveSummary run={run} /></Paper><Paper variant="outlined" sx={{ p: 2 }}><StageSummary summary={summary} /></Paper><RequestTable requests={requests} /></Box>;
}

function RequestDetailPage({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { t } = useTranslation(); const runs = useModel(inference.runs).value;
  const item = runs.flatMap(run => run.requests.map(request => ({ run, request }))).find(candidate => candidate.request.id === requestId);
  return <Box data-testid="inference-request-detail" sx={{ display: "grid", gap: 2 }}><Box><Button onClick={onBack}>{t[RSC.INFERENCE_REQUEST_BACK_BUTTON]}</Button><Typography variant="h2" sx={{ mt: 1 }}>{t[RSC.INFERENCE_REQUEST_DETAIL_LABEL]}</Typography></Box>{item ? <RequestDetail run={item.run} request={item.request} /> : <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_REQUEST_NOT_FOUND_MESSAGE]}</Typography></Paper>}</Box>;
}

function MarkdownAnswer({ request }: { request: InferenceRequest }) {
  const { t } = useTranslation(); const [expanded, setExpanded] = useState(false); const value = request.text || request.error || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT];
  return <Paper component="section" data-testid="inference-request-answer" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}><Typography variant="h2">{t[RSC.INFERENCE_OUTPUT_LABEL]}</Typography><Box sx={{ mt: 1.5, maxHeight: expanded ? "none" : 320, overflow: "hidden", overflowWrap: "anywhere", "& > :first-of-type": { mt: 0 }, "& > :last-child": { mb: 0 }, "& p": { lineHeight: 1.7 }, "& pre": { overflowX: "auto", p: 1.5, bgcolor: "action.hover", borderRadius: 1 }, "& table": { width: "100%", borderCollapse: "collapse" }, "& th, & td": { borderBottom: "1px solid", borderColor: "divider", p: 1 } }}><Suspense fallback={<Typography color="text.secondary">{t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography>}><MarkdownRenderer>{value}</MarkdownRenderer></Suspense></Box>{!expanded && <Box sx={{ display: "flex", justifyContent: "end", mt: 1.5 }}><Button size="small" onClick={() => setExpanded(true)}>{t[RSC.INFERENCE_OUTPUT_EXPAND_BUTTON]}</Button></Box>}</Paper>;
}

function RequestDetail({ run, request }: { run: InferenceRun; request: InferenceRequest }) {
  const { t } = useTranslation(); const state = request.state ?? "unknown";
  return <Box sx={{ display: "grid", gap: 2 }}><Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Box sx={{ minWidth: 0 }}><Typography variant="h2">{run.modelName}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>{request.id}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}: {new Date(request.submittedAt).toLocaleString()}</Typography></Box><Chip size="small" label={t[runState[state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={state === "completed" ? "success" : ["failed", "unknown"].includes(state) ? "warning" : "default"} /></Box>{request.error && <Alert severity="warning" sx={{ mt: 2 }}>{request.error}</Alert>}</Paper><RequestPerformanceMetrics request={request} /><Paper component="section" data-testid="inference-request-question" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}><Typography variant="h2">{t[RSC.INFERENCE_QUESTION_LABEL]}</Typography><Typography component="div" sx={{ mt: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></Paper><MarkdownAnswer request={request} /><Box component="section" aria-label={t[RSC.INFERENCE_REQUEST_MONITORING_TITLE]}><Typography variant="h2" sx={{ mb: 1.5 }}>{t[RSC.INFERENCE_REQUEST_MONITORING_TITLE]}</Typography><RequestMonitoringContent run={run} request={request} showContent={false} showMetrics={false} /></Box></Box>;
}
