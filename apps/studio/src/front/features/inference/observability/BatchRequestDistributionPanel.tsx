import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { BatchRequestDistributions } from "@p4studio/studio_domain/common";
import { batchRequestStatistics } from "@p4studio/studio_domain/front";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { RSC } from "../resource.js";

export function BatchRequestDistributionPanel({ value }: { value: BatchRequestDistributions | undefined }) {
  const { t } = useTranslation();
  const labels = { all: RSC.INFERENCE_BATCH_REQUESTS_ALL_LABEL, verify: RSC.INFERENCE_CHART_VERIFY_LABEL,
    replay: RSC.INFERENCE_CHART_REPLAY_LABEL, decode: RSC.INFERENCE_CHART_DECODE_LABEL, prefill: RSC.INFERENCE_CHART_PREFILL_LABEL } as const;
  return <Paper component="section" variant="outlined" data-testid="inference-batch-request-distribution" aria-label={t[RSC.INFERENCE_BATCH_REQUESTS_LABEL]} sx={{ p: 1.5, minWidth: 0 }}>
    <Typography variant="subtitle2">{t[RSC.INFERENCE_BATCH_REQUESTS_LABEL]}</Typography>
    <Typography variant="caption" color="text.secondary">{t[RSC.INFERENCE_BATCH_REQUESTS_MESSAGE]}</Typography>
    {!value || !value.all.batches ? <Typography role="status">{t[RSC.INFERENCE_VALUE_UNAVAILABLE_TEXT]}</Typography> : <Box sx={{ overflowX: "auto" }}><Table size="small" aria-label={t[RSC.INFERENCE_BATCH_REQUESTS_LABEL]} sx={{ minWidth: 720, "& th:first-of-type, & td:first-of-type": { whiteSpace: "nowrap" } }}>
      <TableHead><TableRow><TableCell>{t[RSC.INFERENCE_BATCH_REQUESTS_PHASE_LABEL]}</TableCell>{[1, 2, 3, 4, "5+"].map(bucket => <TableCell align="right" key={bucket}>{bucket}</TableCell>)}<TableCell align="right">{t[RSC.INFERENCE_BATCH_REQUESTS_AVERAGE_LABEL]}</TableCell><TableCell align="right">{t[RSC.INFERENCE_BATCH_REQUESTS_MULTI_LABEL]}</TableCell></TableRow></TableHead>
      <TableBody>{(Object.keys(labels) as (keyof typeof labels)[]).map(phase => { const row = value[phase], stats = batchRequestStatistics(row); return <TableRow key={phase}>
        <TableCell>{t[labels[phase]]}</TableCell>{row.buckets.map((count, index) => <TableCell align="right" key={index}>{count}</TableCell>)}
        <TableCell align="right">{stats.average?.toFixed(2) ?? "—"}</TableCell><TableCell align="right">{stats.multiRequestRatio === null ? "—" : `${(stats.multiRequestRatio * 100).toFixed(1)}%`}</TableCell>
      </TableRow>; })}</TableBody>
    </Table></Box>}
  </Paper>;
}
