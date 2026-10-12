import { Alert, Box, Typography, useTheme } from "@mui/material";
import { speculativeAcceptance, speculativePathRatios, SPECULATIVE_REPLAY_WARNING_RATIO } from "@p4studio/studio_domain/front";
import type { InferenceSpeculative } from "@p4studio/studio_domain/common";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { LineChart } from "../observability/LineChart.js";
import { RSC } from "./resource.js";

export function SpeculativeMetrics({ value }: { value: InferenceSpeculative | undefined }) {
  const { t } = useTranslation(), theme = useTheme();
  const rate = speculativeAcceptance(value);
  const paths = speculativePathRatios(value);
  const percent = (rate: number | null) => rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
  const annotation = value?.draftedMin === value?.draftedMax ? value?.draftedMin : `${value?.draftedMin}–${value?.draftedMax}`;
  return <Box component="section" data-testid="inference-speculative" aria-label={t[RSC.INFERENCE_SPECULATIVE_TITLE]} sx={{ display: "grid", minWidth: 0 }}>
    <LineChart percent showLatestValues title={t[RSC.INFERENCE_SPECULATIVE_TITLE]} description={t[value ? RSC.INFERENCE_SPECULATIVE_CHART_MESSAGE : RSC.INFERENCE_SPECULATIVE_UNAVAILABLE_MESSAGE]} series={value ? [{
      label: t[RSC.INFERENCE_SPECULATIVE_ACCEPTANCE_LABEL], color: theme.palette.primary.main,
      points: value.points.filter(point => point.drafted > 0).map(point => ({ x: point.atUnixMs, y: point.accepted * 100 / point.drafted })),
    }] : []}>
    {value && <>
      <Box data-testid="inference-speculative-summary" sx={{ mt: .5, display: "flex", flexWrap: "wrap", columnGap: 1, rowGap: .25, "& > p": { fontSize: ".7rem", lineHeight: 1.25 } }}>
        <Typography>{t[RSC.INFERENCE_SPECULATIVE_ACCEPTANCE_LABEL]} <strong data-testid="inference-speculative-rate">{rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}</strong></Typography>
        <Typography variant="body2">{t[RSC.INFERENCE_SPECULATIVE_ACCEPTED_LABEL]} {value.accepted}/{value.drafted}</Typography>
        <Typography variant="body2">{t[RSC.INFERENCE_SPECULATIVE_ROUNDS_LABEL]} {value.rounds}</Typography>
        <Typography variant="body2">{t[RSC.INFERENCE_SPECULATIVE_FULL_LABEL]} {value.full} · {percent(paths.full)}</Typography>
        <Typography variant="body2">{t[RSC.INFERENCE_SPECULATIVE_DIRECT_LABEL]} {value.direct} · {percent(paths.direct)}</Typography>
        <Typography variant="body2">{t[RSC.INFERENCE_SPECULATIVE_REPLAY_LABEL]} {value.replay} · {percent(paths.replay)}</Typography>
      </Box>
      <Typography data-testid="inference-speculative-annotation" color="text.secondary" sx={{ mt: .5, fontSize: ".65rem", lineHeight: 1.25 }}>{t[RSC.INFERENCE_SPECULATIVE_DRAFTED_LABEL]} {value.draftedMin === null ? "—" : annotation} · {t[RSC.INFERENCE_SPECULATIVE_TOTAL_MESSAGE]}</Typography>
      {paths.replay !== null && paths.replay >= SPECULATIVE_REPLAY_WARNING_RATIO && <Alert severity="warning" role="alert" data-testid="inference-replay-warning">{t[RSC.INFERENCE_SPECULATIVE_REPLAY_WARNING_MESSAGE]}</Alert>}
      {value.discardedPoints > 0 && <Typography sx={{ fontSize: ".65rem" }} color="text.secondary">{t[RSC.INFERENCE_SPECULATIVE_TRIMMED_MESSAGE]}</Typography>}
    </>}
    </LineChart>
  </Box>;
}
