import { Alert, Box, Button, Chip, Collapse, Divider, IconButton, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { lazy, Suspense, useEffect, useState } from "react";
import { batchUsageMetrics, deployments, inference, isActiveInference, monitoringSummaryFor, requestMetrics } from "@p4studio/studio_domain/front";
import { canAttemptInference, llamaDispatchLimits, type DeploymentRecord, type InferenceMonitoringSummary, type InferenceRequest, type InferenceRun } from "@p4studio/studio_domain/common";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { startModels } from "../models/api.js";
import { MAX_OUTPUT_TOKENS, startInference } from "./api.js";
import { RSC } from "./resource.js";
import { RequestMonitoringContent, RequestPerformanceMetrics, RunObservability } from "./InferenceObservability.js";
import { InferenceWaveResults } from "./InferenceWaveResults.js";
import { Icon } from "../../shared/components/Icon.js";
import { MenuHeader } from "../../shared/components/MenuHeader.js";

const runState: Record<string, RSC> = { cancelling: RSC.INFERENCE_CANCELLING_STATUS, cancelled: RSC.INFERENCE_CANCELLED_STATUS, preparing: RSC.INFERENCE_PREPARING_STATUS, running: RSC.INFERENCE_RUNNING_STATUS, completed: RSC.INFERENCE_COMPLETED_STATUS, failed: RSC.INFERENCE_FAILED_STATUS, unknown: RSC.INFERENCE_UNKNOWN_STATUS, queued: RSC.INFERENCE_QUEUED_STATUS, streaming: RSC.INFERENCE_STREAMING_STATUS };
const metric = (value: number | null, suffix = "") => value === null ? "—" : `${value.toFixed(suffix.trim() === "ms" ? 0 : 2)}${suffix}`;
const MarkdownRenderer = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([import("react-markdown"), import("remark-gfm")]);
  return { default: ({ children }: { children: string }) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown> };
});
export function InferenceView({ history, historyRunId, requestId, onOpenHistory, onBackHistory, onOpenRequest, onOpenHistoryRequest, onBackRequest }: { history: boolean; historyRunId?: string; requestId?: string; onOpenHistory: (runId: string) => void; onBackHistory: () => void; onOpenRequest: (requestId: string) => void; onOpenHistoryRequest: (requestId: string, runId: string) => void; onBackRequest: (fromHistory: boolean, runId?: string) => void }) {
  const { t } = useTranslation(); const records = useModel(deployments.records).value; const activity = useModel(inference.activity).value;
  const [modelId, setModelId] = useState(""); const models = records.filter(record => record.adapter === "llamacpp"); const readyCount = models.filter(canAttemptInference).length;
  useEffect(() => { startModels(); startInference(); }, []);
  useEffect(() => { if (!models.some(record => record.id === modelId)) setModelId(models[0]?.id ?? ""); }, [modelId, models]);
  return <Box component="section" aria-label={history ? t[RSC.INFERENCE_HISTORY_TITLE_TEXT] : t[RSC.INFERENCE_TITLE_TEXT]}>
    <MenuHeader title={history ? t[RSC.INFERENCE_HISTORY_TITLE_TEXT] : t[RSC.INFERENCE_TITLE_TEXT]} actions={!history && <Chip size="small" label={formatMessage(t[RSC.INFERENCE_READY_COUNT_TEXT], { count: readyCount })} />} />
    {activity.error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{t[RSC.INFERENCE_ERROR_ALERT]}: {activity.error}</Alert>}
    {requestId ? <RequestDetailPage requestId={requestId} onBack={() => onBackRequest(history, historyRunId)} /> : history ? historyRunId ? <HistoryDetailPage runId={historyRunId} onBack={onBackHistory} onOpenRequest={onOpenHistoryRequest} /> : <HistoryListPage onOpen={onOpenHistory} /> : <QueryPanel modelId={modelId} setModelId={setModelId} models={models} onOpenRequest={onOpenRequest} />}
  </Box>;
}
function QueryPanel({ modelId, setModelId, models, onOpenRequest }: { modelId: string; setModelId: (value: string) => void; models: DeploymentRecord[]; onOpenRequest: (requestId: string) => void }) {
  const { t } = useTranslation(); const runIds = useModel(inference.runIds).value; const activity = useModel(inference.activity).value; const currentRunId = runIds[0];
  const [prompt, setPrompt] = useState(""); const [concurrency, setConcurrency] = useState(1); const [repetitions, setRepetitions] = useState(1); const [intervalSeconds, setIntervalSeconds] = useState(0); const [maxTokens, setMaxTokens] = useState(MAX_OUTPUT_TOKENS);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(() => new Set());
  const selected = models.find(record => record.id === modelId); const limits = selected ? llamaDispatchLimits(selected.stages) : null;
  const maxTokensLimit = Math.min(MAX_OUTPUT_TOKENS, limits?.maxOutputTokensPerRequest ?? MAX_OUTPUT_TOKENS);
  useEffect(() => { setMaxTokens(value => Math.min(value, maxTokensLimit)); }, [maxTokensLimit]);
  useEffect(() => {
    setExpandedRunIds(current => {
      const next = new Set(current); let changed = false;
      if (currentRunId && !next.has(currentRunId)) { next.add(currentRunId); changed = true; }
      return changed ? next : current;
    });
  }, [currentRunId]);
  const submit = () => { if (modelId && prompt.trim()) void inference.create({ modelId, prompt, concurrency, repetitions, intervalMs: intervalSeconds * 1000, maxTokens: Math.min(maxTokens, maxTokensLimit) }); };
  return <Box sx={{ display: "grid", gap: 2.5, minWidth: 0 }}><Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}><Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr repeat(4, 1fr)" }, gap: 1.5 }}>
    <TextField required select label={t[RSC.INFERENCE_MODEL_LABEL]} value={modelId} onChange={event => setModelId(event.target.value)}>{models.map(record => <MenuItem key={record.id} value={record.id}>{record.name}</MenuItem>)}</TextField>
    <TextField type="number" label={t[RSC.INFERENCE_CONCURRENCY_LABEL]} value={concurrency} slotProps={{ htmlInput: { min: 1 } }} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1) setConcurrency(value); }} />
    <TextField type="number" label={t[RSC.INFERENCE_REPETITIONS_LABEL]} value={repetitions} slotProps={{ htmlInput: { min: 1 } }} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1) setRepetitions(value); }} />
    <TextField type="number" label={t[RSC.INFERENCE_INTERVAL_LABEL]} value={intervalSeconds} slotProps={{ htmlInput: { min: 0 } }} onChange={event => setIntervalSeconds(Math.max(0, Number(event.target.value)))} />
    <TextField type="number" label={formatMessage(t[RSC.INFERENCE_MAX_TOKENS_LABEL], { limit: maxTokensLimit })} value={Math.min(maxTokens, maxTokensLimit)} slotProps={{ htmlInput: { min: 1, max: maxTokensLimit } }} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1) setMaxTokens(Math.min(maxTokensLimit, value)); }} />
  </Box><TextField required fullWidth multiline minRows={4} sx={{ mt: 2 }} label={t[RSC.INFERENCE_PROMPT_LABEL]} value={prompt} onChange={event => setPrompt(event.target.value)} /><Box sx={{ display: "flex", justifyContent: "end", mt: 2 }}><Button variant="contained" disabled={activity.busy || !modelId || !prompt.trim()} onClick={submit}>{activity.busy ? t[RSC.INFERENCE_SENDING_STATUS] : t[RSC.INFERENCE_SEND_BUTTON]}</Button></Box></Paper>
  {!currentRunId ? <InferenceWaveResults onOpen={onOpenRequest} /> : <Box component="section" aria-label={t[RSC.INFERENCE_RESULTS_LABEL]} data-testid="inference-run-groups" sx={{ display: "grid", gap: .75, minWidth: 0 }}>
    <Typography variant="subtitle2">{t[RSC.INFERENCE_RESULTS_LABEL]}</Typography>
    <CurrentRunGroup key={currentRunId} runId={currentRunId} expanded={expandedRunIds.has(currentRunId)} onToggle={() => setExpandedRunIds(current => { const next = new Set(current); if (next.has(currentRunId)) next.delete(currentRunId); else next.add(currentRunId); return next; })} onDelete={() => inference.remove(currentRunId)} onOpenRequest={onOpenRequest} />
  </Box>}
  </Box>;
}
function CurrentRunGroup({ runId, expanded, onToggle, onDelete, onOpenRequest }: { runId: string; expanded: boolean; onToggle: () => void; onDelete: () => void; onOpenRequest: (requestId: string) => void }) {
  const run = useModel(inference.runModel(runId)).value;
  return run ? <InferenceRunGroup run={run} expanded={expanded} onToggle={onToggle} onDelete={onDelete} onOpenRequest={onOpenRequest} /> : null;
}
function InferenceRunGroup({ run, expanded, onToggle, onDelete, onOpenRequest }: { run: InferenceRun; expanded: boolean; onToggle: () => void; onDelete: () => void; onOpenRequest: (requestId: string) => void }) {
  const { t } = useTranslation(); const summary = monitoringSummaryFor(run); const detailsId = `inference-run-details-${run.id}`;
  const settings = run.settings
    ? formatMessage(t[RSC.INFERENCE_RUN_SETTINGS_TEXT], { concurrency: run.settings.concurrency, repetitions: run.settings.repetitions, intervalSeconds: run.settings.intervalMs / 1000, maxTokens: run.settings.maxTokens })
    : t[RSC.INFERENCE_RUN_SETTINGS_UNAVAILABLE_MESSAGE];
  return <Paper component="article" data-testid="inference-run-group" aria-label={`${run.modelName} · ${run.id}`} variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: .75, minWidth: 0, px: 1, py: .5 }}>
      <IconButton size="small" aria-label={t[RSC.INFERENCE_RUN_DETAILS_TOGGLE_BUTTON]} aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined} onClick={onToggle} sx={{ flex: "0 0 auto" }}><Icon name="chevron" fontSize="small" sx={{ transform: expanded ? "rotate(180deg)" : "none" }} /></IconButton>
      <Box sx={{ display: "flex", alignItems: "center", gap: .75, minWidth: 0, flex: "1 1 auto", flexWrap: { xs: "wrap", md: "nowrap" } }}>
        <Typography variant="body2" title={run.modelName} noWrap sx={{ minWidth: 0, flex: "0 1 260px", fontWeight: 500 }}>{run.modelName}</Typography>
        <Chip size="small" sx={{ flex: "0 0 auto" }} label={t[runState[run.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={run.state === "completed" ? "success" : ["failed", "unknown"].includes(run.state) ? "warning" : "default"} />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: "0 0 auto" }}>{run.requests.length} · {new Date(run.createdAt).toLocaleString()}</Typography>
        <Typography variant="caption" color="text.secondary" title={settings} noWrap sx={{ minWidth: 0, flex: "1 1 220px" }}>{settings}</Typography>
      </Box>
      <RunActions run={run} onDelete={onDelete} />
    </Box>
    <Box sx={{ px: 1.25, pb: .8 }}><SummaryOverview run={run} summary={summary} /></Box>
    {run.state === "cancelled" && <Typography role="status" variant="caption" sx={{ px: 1.25, pb: .8, display: "block" }}>{t[RSC.INFERENCE_CANCELLED_MESSAGE]}</Typography>}
    {run.error && <Alert severity="warning" sx={{ mx: 1.25, mb: .8 }}>{run.error}</Alert>}
    <Collapse id={detailsId} data-testid="inference-run-details" in={expanded} timeout={0} unmountOnExit>
      <Divider />
      <Box sx={{ p: 1, display: "grid", gap: 1, minWidth: 0 }}>
        <RunObservability runId={run.id} />
        <Paper variant="outlined" sx={{ p: .75, minWidth: 0 }}><StageSummary summary={summary} /></Paper>
        <InferenceWaveResults key={run.id} run={run} onOpen={onOpenRequest} />
      </Box>
    </Collapse>
  </Paper>;
}

function RunActions({ run, onDelete, deleteTestId = "inference-run-delete" }: { run: InferenceRun; onDelete?: () => void; deleteTestId?: string }) {
  const { t } = useTranslation(); const active = isActiveInference(run);
  const stopLabel = t[run.state === "cancelling" ? RSC.INFERENCE_CANCELLING_STATUS : RSC.INFERENCE_RUN_STOP_BUTTON];
  return <Box sx={{ display: "flex", flex: "0 0 auto", alignItems: "center" }}>
    {active && <IconButton data-testid="inference-run-stop" size="small" disabled={run.state === "cancelling"} aria-label={stopLabel} title={stopLabel} onClick={() => { void inference.cancel(run.id); }} sx={{ color: "warning.main" }}><Icon name="stop" fontSize="small" /></IconButton>}
    {onDelete && <IconButton data-testid={deleteTestId} size="small" disabled={active} aria-label={t[RSC.INFERENCE_RUN_DELETE_BUTTON]} title={t[RSC.INFERENCE_RUN_DELETE_BUTTON]} onClick={onDelete} sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}><Icon name="delete" fontSize="small" /></IconButton>}
  </Box>;
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return <Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: ".65rem", lineHeight: 1.15 }} color="text.secondary">{label}</Typography><Typography sx={{ mt: .15, fontSize: ".76rem", lineHeight: 1.25, fontWeight: 500, overflowWrap: "anywhere" }}>{value}</Typography></Box>;
}

function SummaryOverview({ run, summary }: { run: InferenceRun; summary: InferenceMonitoringSummary }) {
  const { t } = useTranslation(); const performance = requestMetrics(run); const batch = batchUsageMetrics(run, summary);
  const rows = summary.stages.reduce((sum, stage) => sum + stage.rows, 0);
  return <Box data-testid="inference-run-summary" sx={{ display: "grid", minWidth: 0, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, columnGap: 1, rowGap: .6 }}>
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_PROGRESS_LABEL]} value={`${run.completed} / ${run.submitted}`} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TOKENS_LABEL]} value={performance.totalTokens} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P50_LABEL]} value={metric(performance.ttftP50Ms, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P95_LABEL]} value={metric(performance.ttftP95Ms, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_MAX_LABEL]} value={metric(performance.ttftMaxMs, " ms")} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_OUTPUT_TPS_LABEL]} value={`${metric(performance.outputTpsAverage)} / ${metric(performance.outputTpsPeak)}`} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_EVENTS_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_EVENTS_TEXT], { batches: summary.batchObservations, spans: summary.stageSpans })} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_ROWS_LABEL]} value={rows} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_BATCH_WORK_LABEL]} value={formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_PHASES_TEXT], { prefill: batch.prefillRows, decode: batch.decodeRows, verify: batch.verifyRows, replay: batch.replayRows })} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_BATCH_CONFIG_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_BATCH_CONFIG_TEXT], { ubatch: batch.configuredUbatch, physical: batch.physicalBatches })} />
    <SummaryMetric label={t[RSC.INFERENCE_SUMMARY_BATCH_CAPACITY_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_BATCH_CAPACITY_TEXT], { capacity: batch.capacityRows, fill: batch.fillPercent === null ? t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT] : `${batch.fillPercent.toFixed(1)}%`, fallback: batch.fallbackCapacityRows })} />
    <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>{t[RSC.INFERENCE_SUMMARY_OUTPUT_TPS_MESSAGE]}</Typography>
    <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>{formatMessage(t[RSC.INFERENCE_SUMMARY_BATCH_MESSAGE], { observedStages: batch.observedStages, totalStages: batch.totalStages })}</Typography>
  </Box>;
}

function StageSummary({ summary }: { summary: InferenceMonitoringSummary }) {
  const { t } = useTranslation();
  if (!summary.stages.some(stage => stage.batchObservations || stage.stageSpans)) return <Typography color="text.secondary">{t[RSC.INFERENCE_SUMMARY_EMPTY_MESSAGE]}</Typography>;
  return <Box component="section" aria-label={t[RSC.INFERENCE_STAGE_SUMMARY_LABEL]} sx={{ display: "grid", gap: .6 }}><Typography variant="subtitle2">{t[RSC.INFERENCE_STAGE_SUMMARY_LABEL]}</Typography>{summary.stages.filter(stage => stage.batchObservations || stage.stageSpans).map(stage => <Paper data-testid="inference-stage-summary" variant="outlined" key={`${stage.stageIndex}-${stage.nodeId}`} sx={{ p: .75, minWidth: 0 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}><Typography sx={{ fontSize: ".75rem", lineHeight: 1.25, fontWeight: 500 }}>{t[RSC.INFERENCE_STAGE_LABEL]} {stage.stageIndex + 1} · {stage.agentName} · {stage.nodeId}</Typography><Typography sx={{ fontSize: ".65rem" }} color="text.secondary">{stage.lastObservedAt ? new Date(stage.lastObservedAt).toLocaleString() : t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></Box>
    <Box sx={{ display: "grid", minWidth: 0, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: .75, mt: .5 }}>
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_EVENTS_LABEL]} value={formatMessage(t[RSC.INFERENCE_SUMMARY_EVENTS_TEXT], { batches: stage.batchObservations, spans: stage.stageSpans })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_PHASES_LABEL]} value={stage.batchObservations > 0 ? formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_PHASES_TEXT], { prefill: stage.prefillRows, decode: stage.decodeRows, verify: stage.verifyRows, replay: stage.replayRows }) : formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_BATCH_UNAVAILABLE_TEXT], { spans: stage.stageSpans })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_BATCHES_LABEL]} value={stage.batchObservations > 0 ? formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_BATCHES_TEXT], { physical: stage.physicalBatches, mixed: stage.mixedPhysicalBatches, executions: stage.executionCount, rows: stage.rows, readyRows: stage.maxReadyRows, readySequences: stage.maxReadySequences, capacity: stage.capacityRows, fallback: stage.fallbackCapacityRows }) : formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_BATCH_UNAVAILABLE_TEXT], { spans: stage.stageSpans })} />
      <SummaryMetric label={t[RSC.INFERENCE_STAGE_SUMMARY_TIMING_LABEL]} value={formatMessage(t[RSC.INFERENCE_STAGE_SUMMARY_TIMING_TEXT], { batch: stage.batchStageMs, idle: stage.idleMs, initialIdle: stage.initialIdleMs, gated: stage.idleGated, span: stage.spanStageMs, total: stage.spanTotalMs })} />
    </Box>
  </Paper>)}</Box>;
}

function HistoryListPage({ onOpen }: { onOpen: (runId: string) => void }) {
  const { t } = useTranslation(); const runIds = useModel(inference.runIds).value;
  return <Box sx={{ minWidth: 0 }}>
    {runIds.length === 0 ? <Paper variant="outlined" sx={{ p: 2 }}><Typography color="text.secondary">{t[RSC.INFERENCE_HISTORY_EMPTY_MESSAGE]}</Typography></Paper> : <Box component="section" aria-label={t[RSC.INFERENCE_HISTORY_LIST_LABEL]} sx={{ display: "grid", gap: .6, minWidth: 0 }}>
      {runIds.map(runId => <HistoryListRow key={runId} runId={runId} onOpen={onOpen} />)}
    </Box>}
  </Box>;
}

function HistoryListRow({ runId, onOpen }: { runId: string; onOpen: (runId: string) => void }) {
  const { t } = useTranslation(); const run = useModel(inference.runModel(runId)).value;
  if (!run) return null;
  const summary = monitoringSummaryFor(run);
  const performance = requestMetrics(run);
  const question = run.requests[0]?.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT];
  const agentNames = [...new Set([
    ...summary.stages.map(stage => stage.agentName),
    ...run.requests.flatMap(request => request.telemetry.stages.map(stage => stage.agentName)),
    ...run.monitoring.flatMap(snapshot => snapshot.agents.map(agent => agent.agentName)),
  ])].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })).join(", ") || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT];
  const rowSummary = formatMessage(t[RSC.INFERENCE_HISTORY_ROW_SUMMARY_TEXT], {
    progress: `${run.completed}/${run.submitted}`,
    tokens: performance.totalTokens,
    ttft: metric(performance.ttftP50Ms, " ms"),
    tpsAverage: metric(performance.outputTpsAverage),
    tpsPeak: metric(performance.outputTpsPeak),
  });
  return <Box sx={{ minWidth: 0, overflowX: "auto" }}>
    <Paper component="article" data-testid="inference-history-row" variant="outlined" sx={{ px: 1, py: .45, minWidth: 1008, overflow: "hidden" }}>
      <Box sx={{ display: "grid", alignItems: "center", gap: .75, minWidth: 0, gridTemplateColumns: "76px 125px 190px minmax(155px, 1fr) minmax(215px, 1.4fr) 130px 76px 68px" }}>
        <Chip data-testid="inference-history-status" size="small" label={t[runState[run.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={run.state === "completed" ? "success" : ["failed", "unknown"].includes(run.state) ? "warning" : "default"} sx={{ justifySelf: "start", maxWidth: "100%", height: 21, fontSize: ".68rem", fontWeight: 400, "& .MuiChip-label": { px: .75 } }} />
        <Typography data-testid="inference-history-agents" variant="caption" color="text.secondary" aria-label={t[RSC.INFERENCE_HISTORY_AGENTS_LABEL]} title={agentNames} noWrap sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".7rem", fontWeight: 400 }}>{agentNames}</Typography>
        <Button data-testid="inference-history-model" onClick={() => onOpen(run.id)} title={run.modelName} sx={{ typography: "body2", fontSize: ".76rem", lineHeight: 1.3, fontWeight: 400, width: "100%", justifyContent: "flex-start", minWidth: 0, p: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.primary", textTransform: "none", borderLeft: 1, borderColor: "divider", pl: .75, "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>{run.modelName}</Button>
        <Typography data-testid="inference-history-question" variant="caption" color="text.secondary" title={question} noWrap sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".7rem", fontWeight: 400 }}>{question}</Typography>
        <Typography data-testid="inference-history-summary" variant="caption" title={rowSummary} noWrap sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".68rem", fontWeight: 400 }}>{rowSummary}</Typography>
        <Typography variant="caption" color="text.secondary" title={new Date(run.createdAt).toLocaleString()} noWrap sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", borderLeft: 1, borderColor: "divider", pl: .75, fontSize: ".66rem", fontWeight: 400 }}>{new Date(run.createdAt).toLocaleString()}</Typography>
        <Button data-testid="inference-history-open" size="small" onClick={() => onOpen(run.id)} sx={{ minWidth: 0, px: .5, fontSize: ".7rem", fontWeight: 400, whiteSpace: "nowrap" }}>{t[RSC.INFERENCE_HISTORY_OPEN_BUTTON]}</Button>
        <RunActions run={run} onDelete={() => inference.remove(run.id)} deleteTestId="inference-history-delete" />
      </Box>
    </Paper>
  </Box>;
}

function HistoryDetailPage({ runId, onBack, onOpenRequest }: { runId: string; onBack: () => void; onOpenRequest: (requestId: string, runId: string) => void }) {
  const { t } = useTranslation(); const run = useModel(inference.runModel(runId)).value;
  return <Box data-testid="inference-history-detail" sx={{ display: "grid", gap: 1.25, minWidth: 0, width: "100%" }}><Box><Button onClick={onBack}>{t[RSC.INFERENCE_HISTORY_BACK_BUTTON]}</Button><Typography variant="h2" sx={{ mt: 1 }}>{t[RSC.INFERENCE_HISTORY_DETAIL_LABEL]}</Typography></Box>{run ? <HistoryDetail run={run} onOpenRequest={onOpenRequest} /> : <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_HISTORY_NOT_FOUND_MESSAGE]}</Typography></Paper>}</Box>;
}

function HistoryDetail({ run, onOpenRequest }: { run: InferenceRun; onOpenRequest: (requestId: string, runId: string) => void }) {
  const { t } = useTranslation(); const summary = monitoringSummaryFor(run);
  return <Box sx={{ display: "grid", gap: 1.25, minWidth: 0, width: "100%" }}><Paper variant="outlined" sx={{ p: 1.25, minWidth: 0 }}><Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}><Typography variant="subtitle1">{run.modelName}</Typography><RunActions run={run} /></Box><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: .25 }}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}: {new Date(run.createdAt).toLocaleString()}</Typography><Box sx={{ mt: 1 }}><SummaryOverview run={run} summary={summary} /></Box>{run.error && <Alert severity="warning" sx={{ mt: 1 }}>{run.error}</Alert>}</Paper><RunObservability runId={run.id} /><Paper variant="outlined" sx={{ p: 1 }}><StageSummary summary={summary} /></Paper><InferenceWaveResults key={run.id} run={run} onOpen={requestId => onOpenRequest(requestId, run.id)} /></Box>;
}

function RequestDetailPage({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { t } = useTranslation(); const runIds = useModel(inference.runIds).value;
  const runId = runIds.find(id => inference.runModel(id).value?.requests.some(request => request.id === requestId));
  return <Box data-testid="inference-request-detail" sx={{ display: "grid", gap: 2 }}><Box><Button onClick={onBack}>{t[RSC.INFERENCE_REQUEST_BACK_BUTTON]}</Button><Typography variant="h2" sx={{ mt: 1 }}>{t[RSC.INFERENCE_REQUEST_DETAIL_LABEL]}</Typography></Box>{runId ? <RequestDetailSubscription runId={runId} requestId={requestId} /> : <Paper variant="outlined" sx={{ p: 3 }}><Typography color="text.secondary">{t[RSC.INFERENCE_REQUEST_NOT_FOUND_MESSAGE]}</Typography></Paper>}</Box>;
}

function RequestDetailSubscription({ runId, requestId }: { runId: string; requestId: string }) {
  const run = useModel(inference.runModel(runId)).value;
  const request = run?.requests.find(candidate => candidate.id === requestId);
  return run && request ? <RequestDetail run={run} request={request} /> : null;
}

function MarkdownAnswer({ request }: { request: InferenceRequest }) {
  const { t } = useTranslation(); const [expanded, setExpanded] = useState(false); const value = request.text || request.error || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT];
  return <Paper component="section" data-testid="inference-request-answer" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}><Typography variant="h2">{t[RSC.INFERENCE_OUTPUT_LABEL]}</Typography><Box sx={{ mt: 1.5, maxHeight: expanded ? "none" : 320, overflow: "hidden", overflowWrap: "anywhere", "& > :first-of-type": { mt: 0 }, "& > :last-child": { mb: 0 }, "& p": { lineHeight: 1.7 }, "& pre": { overflowX: "auto", p: 1.5, bgcolor: "action.hover", borderRadius: 1 }, "& table": { width: "100%", borderCollapse: "collapse" }, "& th, & td": { borderBottom: "1px solid", borderColor: "divider", p: 1 } }}><Suspense fallback={<Typography color="text.secondary">{t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography>}><MarkdownRenderer>{value}</MarkdownRenderer></Suspense></Box>{!expanded && <Box sx={{ display: "flex", justifyContent: "end", mt: 1.5 }}><Button size="small" onClick={() => setExpanded(true)}>{t[RSC.INFERENCE_OUTPUT_EXPAND_BUTTON]}</Button></Box>}</Paper>;
}

function RequestDetail({ run, request }: { run: InferenceRun; request: InferenceRequest }) {
  const { t } = useTranslation(); const state = request.state ?? "unknown";
  return <Box sx={{ display: "grid", gap: 2 }}><Paper variant="outlined" sx={{ p: 2 }}><Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}><Box sx={{ minWidth: 0 }}><Typography variant="h2">{run.modelName}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>{request.id}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}: {new Date(request.submittedAt).toLocaleString()}</Typography></Box><Chip size="small" label={t[runState[state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={state === "completed" ? "success" : ["failed", "unknown"].includes(state) ? "warning" : "default"} /></Box>{request.error && <Alert severity="warning" sx={{ mt: 2 }}>{request.error}</Alert>}</Paper><RequestPerformanceMetrics request={request} /><Paper component="section" data-testid="inference-request-question" variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0 }}><Typography variant="h2">{t[RSC.INFERENCE_QUESTION_LABEL]}</Typography><Typography component="div" sx={{ mt: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></Paper><MarkdownAnswer request={request} /><Box component="section" aria-label={t[RSC.INFERENCE_REQUEST_MONITORING_TITLE]}><Typography variant="h2" sx={{ mb: 1.5 }}>{t[RSC.INFERENCE_REQUEST_MONITORING_TITLE]}</Typography><RequestMonitoringContent run={run} request={request} showContent={false} showMetrics={false} /></Box></Box>;
}
