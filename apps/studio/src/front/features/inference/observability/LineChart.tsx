import { Box, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import type { ReactNode } from "react";

type Point = { x: number; y: number };
type Series = { label: string; color: string; dash?: string; points: Point[] };
const CHART_POINT_LIMIT = 640;

function chartPoints(points: Point[]) {
  if (points.length <= CHART_POINT_LIMIT) return points;
  const bucketCount = Math.floor(CHART_POINT_LIMIT / 2);
  const indexes = new Set<number>([0, points.length - 1]);
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = Math.floor(bucketIndex * points.length / bucketCount);
    const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * points.length / bucketCount));
    let minIndex = start, maxIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if (points[index]!.y < points[minIndex]!.y) minIndex = index;
      if (points[index]!.y > points[maxIndex]!.y) maxIndex = index;
    }
    indexes.add(minIndex); indexes.add(maxIndex);
  }
  return [...indexes].sort((left, right) => left - right).map(index => points[index]!);
}

export function LineChart({ title, description, series, percent = false, showLatestValues = false, children }: { title: string; description: string; series: Series[]; percent?: boolean; showLatestValues?: boolean; children?: ReactNode }) {
  const theme = useTheme(); const compact = useMediaQuery(theme.breakpoints.down("sm"));
  const width = compact ? 300 : 800, height = 220, left = 52, right = 16, top = 16, bottom = 32;
  const plottedSeries = series.map(item => ({ ...item, points: chartPoints([...item.points].sort((a, b) => a.x - b.x)) }));
  const points = plottedSeries.flatMap(item => item.points); if (!points.length) return <Paper variant="outlined" sx={{ p: 1 }}><Typography sx={{ fontSize: ".8rem", fontWeight: 500 }}>{title}</Typography><Typography sx={{ fontSize: ".7rem" }} color="text.secondary">{description}</Typography>{children}<Typography color="text.secondary" sx={{ mt: 1 }}>—</Typography></Paper>;
  const { minX, maxX, largestY } = points.reduce((bounds, point) => ({ minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x), largestY: Math.max(bounds.largestY, point.y) }), { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, largestY: 1 });
  const maxY = percent ? 100 : largestY * 1.08;
  const sx = (x: number) => left + (maxX === minX ? .5 : (x - minX) / (maxX - minX)) * (width - left - right);
  const sy = (y: number) => top + (1 - Math.min(maxY, Math.max(0, y)) / maxY) * (height - top - bottom);
  return <Paper component="figure" variant="outlined" sx={{ p: 1, m: 0, minWidth: 0 }}>
    <Typography component="figcaption" sx={{ fontSize: ".8rem", lineHeight: 1.25, fontWeight: 500 }}>{title}</Typography><Typography sx={{ fontSize: ".7rem", lineHeight: 1.25 }} color="text.secondary">{description}</Typography>
    {children}
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: .5 }}>{plottedSeries.map(item => { const latest = item.points.at(-1); const label = showLatestValues && latest ? `${item.label} ${percent ? `${latest.y.toFixed(1)}%` : latest.y.toFixed(0)}` : item.label; return <Box key={item.label} sx={{ display: "flex", gap: .5, alignItems: "center" }}><svg aria-hidden="true" width="16" height="8"><line x1="0" x2="16" y1="4" y2="4" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} /></svg><Typography sx={{ fontSize: ".65rem", fontVariantNumeric: "tabular-nums" }}>{label}</Typography></Box>; })}</Box>
    <Box sx={{ mt: .5, width: "100%", overflow: "hidden" }}><svg role="img" aria-label={`${title}. ${description}`} viewBox={`0 0 ${width} ${height}`} width="100%" height="180">
      {[0, .25, .5, .75, 1].map(fraction => { const y = top + fraction * (height - top - bottom); const value = maxY * (1 - fraction); return <g key={fraction}><line x1={left} x2={width - right} y1={y} y2={y} stroke={theme.palette.divider} strokeWidth="1" /><text x={left - 8} y={y + 4} textAnchor="end" fill={theme.palette.text.secondary} fontSize="11">{percent ? `${Math.round(value)}%` : value.toFixed(value < 10 ? 1 : 0)}</text></g>; })}
      {plottedSeries.map(item => { const path = item.points.map((point, index) => `${index ? "L" : "M"}${sx(point.x)},${sy(point.y)}`).join(" "); const latest = item.points.at(-1); return <g key={item.label}>{item.points.length === 1 && latest && <circle cx={sx(latest.x)} cy={sy(latest.y)} r={3} fill={item.color} />}<path d={path} fill="none" stroke={item.color} strokeWidth="1.5" strokeDasharray={item.dash} strokeLinejoin="round" strokeLinecap="round" aria-label={item.label}>{latest && <title>{`${item.label}: ${latest.y.toFixed(2)} · ${new Date(latest.x).toLocaleTimeString()}`}</title>}</path></g>; })}
      <text x={left} y={height - 8} fill={theme.palette.text.secondary} fontSize="11">{new Date(minX).toLocaleTimeString()}</text><text x={width - right} y={height - 8} textAnchor="end" fill={theme.palette.text.secondary} fontSize="11">{new Date(maxX).toLocaleTimeString()}</text>
    </svg></Box>
  </Paper>;
}

