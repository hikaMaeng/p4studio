import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography, useTheme } from "@mui/material";
import { useState } from "react";
import { requestBatchFillRatio } from "@p4studio/studio_domain/front";
import type { InferenceRequest, InferenceRun } from "@p4studio/studio_domain/common";
import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";

type Point = { x: number; y: number };
type Series = { label: string; color: string; points: Point[] };
const fmt = (value: number | null, suffix = "") => value === null ? "—" : `${value.toFixed(2)}${suffix}`;

function LineChart({ title, description, series, percent = false }: { title: string; description: string; series: Series[]; percent?: boolean }) {
  const theme = useTheme(); const width = 800, height = 220, left = 52, right = 16, top = 16, bottom = 32;
  const points = series.flatMap(item => item.points); if (!points.length) return <Paper variant="outlined" sx={{ p: 2 }}><Typography sx={{ fontWeight: 650 }}>{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{description}</Typography><Typography color="text.secondary" sx={{ mt: 3 }}>—</Typography></Paper>;
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
  const maxY = percent ? 100 : Math.max(1, ...points.map(point => point.y)) * 1.08;
  const sx = (x: number) => left + (maxX === minX ? .5 : (x - minX) / (maxX - minX)) * (width - left - right);
  const sy = (y: number) => top + (1 - Math.min(maxY, Math.max(0, y)) / maxY) * (height - top - bottom);
  return <Paper component="figure" variant="outlined" sx={{ p: 2, m: 0, minWidth: 0 }}>
    <Typography component="figcaption" sx={{ fontWeight: 650 }}>{title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{description}</Typography>
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 1 }}>{series.map(item => <Box key={item.label} sx={{ display: "flex", gap: .75, alignItems: "center" }}><Box aria-hidden="true" sx={{ width: 18, height: 3, bgcolor: item.color, borderRadius: 2 }} /><Typography variant="caption">{item.label}</Typography></Box>)}</Box>
    <Box sx={{ mt: 1, width: "100%", overflow: "hidden" }}><svg role="img" aria-label={`${title}. ${description}`} viewBox={`0 0 ${width} ${height}`} width="100%" height="220">
      {[0, .25, .5, .75, 1].map(fraction => { const y = top + fraction * (height - top - bottom); const value = maxY * (1 - fraction); return <g key={fraction}><line x1={left} x2={width - right} y1={y} y2={y} stroke={theme.palette.divider} strokeWidth="1" /><text x={left - 8} y={y + 4} textAnchor="end" fill={theme.palette.text.secondary} fontSize="11">{percent ? `${Math.round(value)}%` : value.toFixed(value < 10 ? 1 : 0)}</text></g>; })}
      {series.map(item => { const ordered = [...item.points].sort((a, b) => a.x - b.x); const path = ordered.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" "); return <g key={item.label}><path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{ordered.map(point => <circle key={`${point.x}-${point.y}`} cx={sx(point.x)} cy={sy(point.y)} r="3" fill={item.color}><title>{`${item.label}: ${point.y.toFixed(2)} · ${new Date(point.x).toLocaleTimeString()}`}</title></circle>)}</g>; })}
      <text x={left} y={height - 8} fill={theme.palette.text.secondary} fontSize="11">{new Date(minX).toLocaleTimeString()}</text><text x={width - right} y={height - 8} textAnchor="end" fill={theme.palette.text.secondary} fontSize="11">{new Date(maxX).toLocaleTimeString()}</text>
    </svg></Box>
  </Paper>;
}

const aggregateBatch = (run: InferenceRun) => {
  const values = new Map<number, { rows: number; capacity: number; ready: number; prefill: number; decode: number; verify: number; replay: number }>();
  for (const point of run.telemetrySeries.batches) { const value = values.get(point.atUnixMs) ?? { rows: 0, capacity: 0, ready: 0, prefill: 0, decode: 0, verify: 0, replay: 0 }; value.rows += point.rows; value.capacity += point.capacityRows; value.ready = Math.max(value.ready, point.readyRowsMax); value.prefill += point.prefillRows; value.decode += point.decodeRows; value.verify += point.verifyRows; value.replay += point.replayRows; values.set(point.atUnixMs, value); }
  return [...values].sort(([left], [right]) => left - right);
};

const resourceSeries = (run: InferenceRun) => run.monitoring.map(snapshot => {
  const gpus = snapshot.nodes.flatMap(node => node.gpus); const utilization = gpus.map(gpu => gpu.utilizationGpuPercent).filter((value): value is number => value !== null); const memory = gpus.map(gpu => gpu.vramUsedBytes + gpu.vramFreeBytes > 0 ? gpu.vramUsedBytes * 100 / (gpu.vramUsedBytes + gpu.vramFreeBytes) : null).filter((value): value is number => value !== null);
  return { x: Date.parse(snapshot.generatedAt), utilization: utilization.length ? utilization.reduce((sum, value) => sum + value, 0) / utilization.length : null, memory: memory.length ? memory.reduce((sum, value) => sum + value, 0) / memory.length : null };
}).filter(point => Number.isFinite(point.x));

const deliverySeries = (run: InferenceRun) => run.monitoring.map(snapshot => {
  const deliveries = snapshot.nodes.map(node => node.delivery).filter(value => value !== null);
  const completions = deliveries.map(value => value.completionRetained).filter((value): value is number => value !== null);
  const brokers = snapshot.agents.map(agent => agent.broker).filter(value => value !== null);
  const allocated = brokers.map(value => value.allocatedEvents).filter((value): value is number => value !== null);
  const evicted = brokers.map(value => value.evictedEvents).filter((value): value is number => value !== null);
  return {
    x: Date.parse(snapshot.generatedAt),
    input: deliveries.length ? deliveries.reduce((sum, value) => sum + value.inputRetained, 0) : null,
    completion: completions.length ? completions.reduce((sum, value) => sum + value, 0) : null,
    allocated: allocated.length ? allocated.reduce((sum, value) => sum + value, 0) : null,
    evicted: evicted.length ? evicted.reduce((sum, value) => sum + value, 0) : null,
    allocatedMiB: brokers.length && brokers.every(value => value.allocatedEventBytes !== null)
      ? brokers.reduce((sum, value) => sum + value.allocatedEventBytes!, 0) / (1024 * 1024) : null,
  };
}).filter(point => Number.isFinite(point.x));

export function RunObservability({ run }: { run: InferenceRun }) {
  const { t } = useTranslation(); const theme = useTheme(); const batches = aggregateBatch(run); const resources = resourceSeries(run); const delivery = deliverySeries(run);
  const output = [...run.telemetrySeries.output].sort((a, b) => a.atUnixMs - b.atUnixMs);
  const stageIndexes = [...new Set(run.telemetrySeries.spans.map(point => point.stageIndex))].sort((a, b) => a - b);
  const stageColors = [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.info.main, theme.palette.error.main];
  const coverage = { requests: run.requests.filter(request => request.telemetry.batchObservations || request.telemetry.stages.length).length, batches: run.telemetrySeries.batches.reduce((sum, point) => sum + point.observations, 0), spans: run.telemetrySeries.spans.reduce((sum, point) => sum + point.spans, 0), resources: run.monitoring.length };
  return <Box component="section" data-testid="inference-run-observability" aria-label={t[RSC.INFERENCE_OBSERVABILITY_LABEL]} sx={{ display: "grid", gap: 1.5 }}>
    <Box><Typography variant="h2">{t[RSC.INFERENCE_OBSERVABILITY_LABEL]}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{t[RSC.INFERENCE_OBSERVABILITY_MESSAGE]}</Typography></Box>
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, display: "flex", gap: 2.5, flexWrap: "wrap" }}><Typography variant="body2">{t[RSC.INFERENCE_COVERAGE_REQUESTS_LABEL]} <strong>{coverage.requests}/{run.requests.length}</strong></Typography><Typography variant="body2">{t[RSC.INFERENCE_COVERAGE_BATCHES_LABEL]} <strong>{coverage.batches}</strong></Typography><Typography variant="body2">{t[RSC.INFERENCE_COVERAGE_SPANS_LABEL]} <strong>{coverage.spans}</strong></Typography><Typography variant="body2">{t[RSC.INFERENCE_COVERAGE_RESOURCES_LABEL]} <strong>{coverage.resources}</strong></Typography></Paper>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
      <LineChart title={t[RSC.INFERENCE_CHART_THROUGHPUT_TITLE]} description={t[RSC.INFERENCE_CHART_THROUGHPUT_MESSAGE]} series={[{ label: t[RSC.INFERENCE_CHART_OUTPUT_TOKENS_LABEL], color: theme.palette.primary.main, points: output.map(point => ({ x: point.atUnixMs, y: point.tokens })) }, { label: t[RSC.INFERENCE_CHART_ACTIVE_REQUESTS_LABEL], color: theme.palette.warning.main, points: output.map(point => ({ x: point.atUnixMs, y: point.queued + point.streaming })) }]} />
      <LineChart percent title={t[RSC.INFERENCE_CHART_BATCH_FILL_TITLE]} description={t[RSC.INFERENCE_CHART_BATCH_FILL_MESSAGE]} series={[{ label: t[RSC.INFERENCE_CHART_BATCH_FILL_LABEL], color: theme.palette.secondary.main, points: batches.filter(([, value]) => value.capacity > 0).map(([x, value]) => ({ x, y: value.rows * 100 / value.capacity })) }]} />
      <LineChart title={t[RSC.INFERENCE_CHART_PHASES_TITLE]} description={t[RSC.INFERENCE_CHART_PHASES_MESSAGE]} series={[{ label: t[RSC.INFERENCE_CHART_PREFILL_LABEL], color: theme.palette.info.main, points: batches.map(([x, value]) => ({ x, y: value.prefill })) }, { label: t[RSC.INFERENCE_CHART_DECODE_LABEL], color: theme.palette.success.main, points: batches.map(([x, value]) => ({ x, y: value.decode })) }, { label: t[RSC.INFERENCE_CHART_READY_LABEL], color: theme.palette.warning.main, points: batches.map(([x, value]) => ({ x, y: value.ready })) }]} />
      <LineChart title={t[RSC.INFERENCE_CHART_STAGE_TITLE]} description={t[RSC.INFERENCE_CHART_STAGE_MESSAGE]} series={stageIndexes.map((stageIndex, index) => ({ label: `${t[RSC.INFERENCE_STAGE_LABEL]} ${stageIndex + 1}`, color: stageColors[index % stageColors.length]!, points: run.telemetrySeries.spans.filter(point => point.stageIndex === stageIndex).map(point => ({ x: point.atUnixMs, y: point.spans ? point.stageMs / point.spans : 0 })) }))} />
      <LineChart percent title={t[RSC.INFERENCE_CHART_RESOURCE_TITLE]} description={t[RSC.INFERENCE_CHART_RESOURCE_MESSAGE]} series={[{ label: t[RSC.INFERENCE_CHART_GPU_LABEL], color: theme.palette.primary.main, points: resources.filter(point => point.utilization !== null).map(point => ({ x: point.x, y: point.utilization! })) }, { label: t[RSC.INFERENCE_CHART_VRAM_LABEL], color: theme.palette.error.main, points: resources.filter(point => point.memory !== null).map(point => ({ x: point.x, y: point.memory! })) }]} />
      <LineChart title={t[RSC.INFERENCE_CHART_DELIVERY_TITLE]} description={t[RSC.INFERENCE_CHART_DELIVERY_MESSAGE]} series={[
        { label: t[RSC.INFERENCE_CHART_INPUT_RETAINED_LABEL], color: theme.palette.info.main, points: delivery.filter(point => point.input !== null).map(point => ({ x: point.x, y: point.input! })) },
        { label: t[RSC.INFERENCE_CHART_COMPLETION_RETAINED_LABEL], color: theme.palette.success.main, points: delivery.filter(point => point.completion !== null).map(point => ({ x: point.x, y: point.completion! })) },
        { label: t[RSC.INFERENCE_CHART_BROKER_ALLOCATED_LABEL], color: theme.palette.warning.main, points: delivery.filter(point => point.allocated !== null).map(point => ({ x: point.x, y: point.allocated! })) },
        { label: t[RSC.INFERENCE_CHART_BROKER_EVICTED_LABEL], color: theme.palette.error.main, points: delivery.filter(point => point.evicted !== null).map(point => ({ x: point.x, y: point.evicted! })) },
      ]} />
      <LineChart title={t[RSC.INFERENCE_CHART_RECEIPT_MEMORY_TITLE]} description={t[RSC.INFERENCE_CHART_RECEIPT_MEMORY_MESSAGE]} series={[{ label: t[RSC.INFERENCE_CHART_RECEIPT_MEMORY_LABEL], color: theme.palette.secondary.main, points: delivery.filter(point => point.allocatedMiB !== null).map(point => ({ x: point.x, y: point.allocatedMiB! })) }]} />
    </Box>
  </Box>;
}

export function RequestPerformanceMetrics({ request }: { request: InferenceRequest }) {
  const { t } = useTranslation(); const telemetry = request.telemetry; const fill = requestBatchFillRatio(request); const e2e = request.completedAt ? Date.parse(request.completedAt) - Date.parse(request.submittedAt) : null;
  return <Box data-testid="inference-request-metrics" sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5 }}>{[
    [t[RSC.INFERENCE_TTFT_LABEL], fmt(request.ttftMs, " ms")], [t[RSC.INFERENCE_REQUEST_MONITORING_E2E_LABEL], fmt(e2e, " ms")], [t[RSC.INFERENCE_FINAL_TPS_LABEL], fmt(request.finalTps)], [t[RSC.INFERENCE_GENERATION_TPS_LABEL], fmt(request.generationTps)],
    [t[RSC.INFERENCE_REQUEST_MONITORING_BATCH_FILL_LABEL], fmt(fill === null ? null : fill * 100, "%")], [t[RSC.INFERENCE_REQUEST_MONITORING_ISSUES_LABEL], telemetry.issueCount], [t[RSC.INFERENCE_REQUEST_MONITORING_MIXED_LABEL], telemetry.mixedPhysicalBatches], [t[RSC.INFERENCE_REQUEST_MONITORING_PREFILL_ROWS_LABEL], telemetry.prefillRows], [t[RSC.INFERENCE_REQUEST_MONITORING_DECODE_ROWS_LABEL], telemetry.decodeRows],
  ].map(([label, value]) => <Paper variant="outlined" sx={{ p: 1.5 }} key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ mt: .25, fontWeight: 650 }}>{value}</Typography></Paper>)}</Box>;
}

export function RequestMonitoringContent({ run, request, showContent = true, showMetrics = true }: { run: InferenceRun; request: InferenceRequest; showContent?: boolean; showMetrics?: boolean }) {
  const { t } = useTranslation(); const telemetry = request.telemetry;
  const first = telemetry.stages.map(stage => stage.firstIngressUnixMs).filter((value): value is number => value !== null); const last = telemetry.stages.map(stage => stage.lastForwardUnixMs).filter((value): value is number => value !== null); const min = first.length ? Math.min(...first) : 0, max = last.length ? Math.max(...last) : 0, range = Math.max(1, max - min);
  return <Box sx={{ display: "grid", gap: 2 }}>
    {showContent && <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_QUESTION_LABEL]}</Typography><Box component="pre" data-testid="inference-monitoring-question" sx={{ mt: .75, mb: 0, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit" }}>{request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Box></Paper>
      <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}><Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_OUTPUT_LABEL]}</Typography><Box component="pre" data-testid="inference-monitoring-answer" sx={{ mt: .75, mb: 0, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit" }}>{request.text || request.error || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Box></Paper>
    </Box>}
    {showMetrics && <RequestPerformanceMetrics request={request} />}
    {telemetry.stages.length === 0 ? <Paper variant="outlined" sx={{ p: 2 }}><Typography color="text.secondary">{t[RSC.INFERENCE_REQUEST_MONITORING_UNAVAILABLE_MESSAGE]}</Typography></Paper> : <Box><Typography sx={{ fontWeight: 650, mb: 1 }}>{t[RSC.INFERENCE_REQUEST_MONITORING_WATERFALL_LABEL]}</Typography><Box sx={{ display: "grid", gap: 1 }}>{telemetry.stages.map(stage => { const start = stage.firstIngressUnixMs ?? min, end = stage.lastForwardUnixMs ?? start; return <Box key={`${stage.stageIndex}-${stage.nodeId}`} sx={{ display: "grid", gridTemplateColumns: "120px minmax(180px, 1fr) 100px", gap: 1, alignItems: "center" }}><Typography variant="body2">{t[RSC.INFERENCE_STAGE_LABEL]} {stage.stageIndex + 1}</Typography><Box sx={{ height: 20, bgcolor: "action.hover", position: "relative", overflow: "hidden" }}><Box sx={{ position: "absolute", insetBlock: 3, left: `${(start - min) * 100 / range}%`, width: `${Math.max(1, (end - start) * 100 / range)}%`, bgcolor: "primary.main" }} /></Box><Typography variant="caption" align="right">{Math.max(0, end - start)} ms</Typography></Box>; })}</Box></Box>}
    <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={t[RSC.INFERENCE_REQUEST_MONITORING_STAGE_TABLE_LABEL]}><TableHead><TableRow><TableCell>{t[RSC.INFERENCE_STAGE_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_REQUEST_MONITORING_EXECUTIONS_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_REQUEST_MONITORING_INGRESS_QUEUE_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_REQUEST_MONITORING_SHARED_STAGE_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_REQUEST_MONITORING_FORWARD_LABEL]}</TableCell></TableRow></TableHead><TableBody>{telemetry.stages.map(stage => <TableRow key={`${stage.stageIndex}-${stage.nodeId}`}><TableCell>{stage.agentName} · {stage.nodeId}</TableCell><TableCell align="right">{stage.executions}</TableCell><TableCell align="right">{stage.ingressQueueMs} ms</TableCell><TableCell align="right">{stage.sharedStageMs} ms</TableCell><TableCell align="right">{stage.forwardMs} ms</TableCell></TableRow>)}</TableBody></Table></Box>
    <Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_REQUEST_MONITORING_SHARED_TIME_MESSAGE]}</Typography>
  </Box>;
}

export function RequestMonitoringButton({ run, request }: { run: InferenceRun; request: InferenceRequest }) {
  const { t } = useTranslation(); const [open, setOpen] = useState(false);
  return <><Button size="small" onClick={() => setOpen(true)}>{t[RSC.INFERENCE_REQUEST_MONITORING_BUTTON]}</Button><Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xl" aria-labelledby={`inference-monitoring-${request.id}`}><DialogTitle id={`inference-monitoring-${request.id}`}>{t[RSC.INFERENCE_REQUEST_MONITORING_TITLE]}</DialogTitle><DialogContent dividers><Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>{request.id} · {run.modelName}</Typography><RequestMonitoringContent run={run} request={request} /></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>{t[RSC.INFERENCE_OUTPUT_CLOSE_BUTTON]}</Button></DialogActions></Dialog></>;
}
