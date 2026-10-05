import { Box, Button, Chip, Collapse, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useId, useState, type KeyboardEvent } from "react";
import { groupInferenceWaves, type InferenceWave } from "@p4studio/studio_domain/front";
import type { InferenceRequest, InferenceRun } from "@p4studio/studio_domain/common";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { Icon } from "../../shared/components/Icon.js";
import { paginateResults } from "./pagination.js";
import { RSC } from "./resource.js";

const metric = (value: number | null, suffix = "") => value === null ? "—" : `${value.toFixed(suffix.trim() === "ms" ? 0 : 2)}${suffix}`;
const requestState: Record<string, RSC> = { queued: RSC.INFERENCE_QUEUED_STATUS, streaming: RSC.INFERENCE_STREAMING_STATUS, completed: RSC.INFERENCE_COMPLETED_STATUS, failed: RSC.INFERENCE_FAILED_STATUS, unknown: RSC.INFERENCE_UNKNOWN_STATUS };
const cellSx = { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" };
const metricCellSx = { ...cellSx, fontVariantNumeric: "tabular-nums", textAlign: "right" };

export function InferenceWaveResults({ run, onOpen }: { run?: InferenceRun; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number | null>>(() => new Set());
  const waves = run ? groupInferenceWaves(run) : [];
  const { page: currentPage, pageCount, items } = paginateResults(waves, page);
  return <Paper component="section" aria-label={t[RSC.INFERENCE_RESULTS_LABEL]} variant="outlined" data-testid="inference-wave-results" sx={{ overflow: "hidden", minWidth: 0, width: "100%" }}>
    <Box sx={{ px: 1.25, py: .75, borderBottom: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle2">{t[RSC.INFERENCE_RESULTS_LABEL]}</Typography>
      <Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_WAVE_SUMMARY_MESSAGE]}</Typography>
    </Box>
    {!run || waves.length === 0 ? <Typography color="text.secondary" sx={{ p: 2 }}>{t[RSC.INFERENCE_RESULTS_EMPTY_MESSAGE]}</Typography> : <>
      <Box component="ul" aria-label={t[RSC.INFERENCE_WAVE_SUMMARY_LABEL]} sx={{ display: "grid", gap: .5, listStyle: "none", m: 0, p: .5, minWidth: 0 }}>
        {items.map(wave => <WaveGroup key={wave.waveIndex ?? "legacy"} run={run} wave={wave} expanded={expanded.has(wave.waveIndex)} onToggle={() => setExpanded(current => {
          const next = new Set(current);
          if (next.has(wave.waveIndex)) next.delete(wave.waveIndex); else next.add(wave.waveIndex);
          return next;
        })} onOpen={onOpen} />)}
      </Box>
      <Box data-testid="inference-wave-pagination" sx={{ px: 1, py: .5, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "end", alignItems: "center", gap: .5 }}>
        <Button size="small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t[RSC.INFERENCE_PAGINATION_PREVIOUS_BUTTON]}</Button>
        <Typography variant="caption">{formatMessage(t[RSC.INFERENCE_WAVE_PAGINATION_PAGE_TEXT], { page: currentPage + 1, pages: pageCount })}</Typography>
        <Button size="small" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>{t[RSC.INFERENCE_PAGINATION_NEXT_BUTTON]}</Button>
      </Box>
    </>}
  </Paper>;
}

function WaveGroup({ run, wave, expanded, onToggle, onOpen }: { run: InferenceRun; wave: InferenceWave; expanded: boolean; onToggle: () => void; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation(); const id = useId();
  const title = wave.waveIndex === null ? t[RSC.INFERENCE_WAVE_LEGACY_LABEL] : formatMessage(t[RSC.INFERENCE_WAVE_SUMMARY_WAVE_TEXT], { wave: wave.waveIndex });
  return <Paper component="li" data-testid="inference-wave-row" data-wave-index={wave.waveIndex ?? "legacy"} variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
    <Button id={`${id}-toggle`} data-testid="inference-wave-toggle" aria-label={formatMessage(t[RSC.INFERENCE_WAVE_SESSIONS_TOGGLE_BUTTON], { wave: title })} aria-expanded={expanded} aria-controls={expanded ? `${id}-sessions` : undefined} onClick={onToggle} sx={{ display: "flex", width: "100%", gap: .75, px: .5, py: .5, textTransform: "none", color: "text.primary", justifyContent: "start", textAlign: "start", minWidth: 0 }}>
      <Icon name="chevron" fontSize="small" sx={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none" }} />
      <WaveStatistics wave={wave} title={title} />
    </Button>
    <Collapse id={`${id}-sessions`} data-testid="inference-wave-sessions" in={expanded} timeout={0} unmountOnExit>
      <Box role="region" aria-labelledby={`${id}-toggle`} sx={{ borderTop: "1px solid", borderColor: "divider", overflowX: "auto", minWidth: 0 }}>
        <WaveSessions run={run} requests={wave.requests} title={formatMessage(t[RSC.INFERENCE_WAVE_SESSIONS_LABEL], { wave: title })} onOpen={onOpen} />
      </Box>
    </Collapse>
  </Paper>;
}

function InlineMetric({ label, value }: { label: string; value: string | number }) {
  return <Box component="span" sx={{ display: "flex", alignItems: "baseline", gap: .5, minWidth: 0, whiteSpace: "nowrap" }}>
    <Typography component="span" sx={{ fontSize: ".65rem", lineHeight: 1.2 }} color="text.secondary">{label}</Typography>
    <Typography component="span" sx={{ fontSize: ".76rem", lineHeight: 1.2, fontWeight: 500 }}>{value}</Typography>
  </Box>;
}

function WaveStatistics({ wave, title }: { wave: InferenceWave; title: string }) {
  const { t } = useTranslation();
  return <Box component="span" data-testid="inference-wave-statistics" sx={{ display: "grid", gridTemplateColumns: "max-content repeat(4, minmax(max-content, 1fr))", columnGap: 2, rowGap: .4, overflowX: "auto", minWidth: 0, flex: "1 1 auto" }}>
    <Box component="span" sx={{ display: "flex", alignItems: "baseline", gap: .75, whiteSpace: "nowrap" }}>
      <Typography component="span" sx={{ fontSize: ".75rem", lineHeight: 1.2, fontWeight: 500 }}>{title}</Typography>
      <Typography component="span" sx={{ fontSize: ".65rem", lineHeight: 1.2 }} color="text.secondary">{t[RSC.INFERENCE_WAVE_SUMMARY_SENT_LABEL]}</Typography>
    </Box>
    <InlineMetric label={t[RSC.INFERENCE_WAVE_SUMMARY_PROGRESS_LABEL]} value={`${wave.completed} / ${wave.submitted}`} />
    <InlineMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P50_LABEL]} value={metric(wave.ttftP50Ms, " ms")} />
    <InlineMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_P95_LABEL]} value={metric(wave.ttftP95Ms, " ms")} />
    <InlineMetric label={t[RSC.INFERENCE_SUMMARY_TTFT_MAX_LABEL]} value={metric(wave.ttftMaxMs, " ms")} />
    <Typography component="span" noWrap sx={{ fontSize: ".76rem", lineHeight: 1.2, fontWeight: 500 }}>{wave.sentAt ? new Date(wave.sentAt).toLocaleString() : t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography>
    <InlineMetric label={t[RSC.INFERENCE_WAVE_SUMMARY_PREFILL_TPS_P50_LABEL]} value={metric(wave.prefillTpsP50)} />
    <InlineMetric label={t[RSC.INFERENCE_WAVE_SUMMARY_GENERATION_TPS_P50_LABEL]} value={metric(wave.generationTpsP50)} />
    <InlineMetric label={t[RSC.INFERENCE_SUMMARY_FINAL_TPS_P50_LABEL]} value={metric(wave.finalTpsP50)} />
    <InlineMetric label={t[RSC.INFERENCE_REQUEST_MONITORING_E2E_LABEL]} value={metric(wave.elapsedMs, " ms")} />
  </Box>;
}

function WaveSessions({ run, requests, title, onOpen }: { run: InferenceRun; requests: InferenceRequest[]; title: string; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation();
  const headerSx = { ...cellSx, fontSize: ".68rem", lineHeight: 1.2 };
  return <Table size="small" aria-label={title} sx={{ width: "100%", minWidth: 680, tableLayout: "fixed", "& .MuiTableCell-root": { px: { xs: .5, sm: .75 } } }}>
    <colgroup><col style={{ width: "18%" }} /><col style={{ width: "9%" }} /><col style={{ width: "25%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /><col style={{ width: "13%" }} /><col style={{ width: "18%" }} /></colgroup>
    <TableHead><TableRow>
      <TableCell sx={headerSx}>{t[RSC.INFERENCE_REQUEST_LABEL]}</TableCell><TableCell sx={headerSx}>{t[RSC.INFERENCE_STATE_LABEL]}</TableCell><TableCell sx={headerSx}>{t[RSC.INFERENCE_QUESTION_LABEL]}</TableCell><TableCell align="right" sx={headerSx}>{t[RSC.INFERENCE_TTFT_LABEL]}</TableCell><TableCell align="right" sx={headerSx}>{t[RSC.INFERENCE_FINAL_TPS_LABEL]}</TableCell><TableCell align="right" sx={headerSx}>{t[RSC.INFERENCE_REQUEST_MONITORING_E2E_LABEL]}</TableCell><TableCell align="right" sx={headerSx}>{t[RSC.INFERENCE_HISTORY_CREATED_LABEL]}</TableCell>
    </TableRow></TableHead>
    <TableBody>{requests.map(request => <SessionRow key={request.id} run={run} request={request} onOpen={onOpen} />)}</TableBody>
  </Table>;
}

function SessionRow({ run, request, onOpen }: { run: InferenceRun; request: InferenceRequest; onOpen?: (requestId: string) => void }) {
  const { t } = useTranslation();
  const open = () => onOpen?.(request.id);
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => { if (onOpen && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); open(); } };
  const elapsedMs = request.completedAt ? Date.parse(request.completedAt) - Date.parse(request.submittedAt) : null;
  return <TableRow data-testid="inference-request-row" data-request-id={request.id} hover={Boolean(onOpen)} onClick={onOpen ? open : undefined} onKeyDown={onOpen ? onKeyDown : undefined} role={onOpen ? "button" : undefined} tabIndex={onOpen ? 0 : undefined} sx={{ "& > *": { py: .6, whiteSpace: "normal", lineHeight: 1.25 }, ...(onOpen ? { cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } } : {}) }}>
    <TableCell sx={cellSx}><Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 150 }}>{request.id}</Typography><Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", maxWidth: 150, fontSize: ".68rem" }}>{run.modelName}</Typography></TableCell>
    <TableCell sx={cellSx}><Chip size="small" label={t[requestState[request.state] ?? RSC.INFERENCE_UNKNOWN_STATUS]} color={request.state === "completed" ? "success" : ["failed", "unknown"].includes(request.state) ? "warning" : "default"} /></TableCell>
    <TableCell sx={{ ...cellSx, maxWidth: 0 }}><Typography variant="body2" sx={{ overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflowWrap: "anywhere" }} title={request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}>{request.prompt || t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography></TableCell>
    <TableCell align="right" sx={metricCellSx}>{metric(request.ttftMs, " ms")}</TableCell><TableCell align="right" sx={metricCellSx}>{metric(request.finalTps)}</TableCell><TableCell align="right" sx={metricCellSx}>{metric(elapsedMs, " ms")}</TableCell><TableCell align="right" sx={{ ...metricCellSx, fontSize: ".7rem" }}>{new Date(request.submittedAt).toLocaleString()}</TableCell>
  </TableRow>;
}
