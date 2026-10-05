import { Box, Typography } from "@mui/material";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { RSC } from "./resource.js";

/** Adapter snapshots may be plain status strings, JSON text, or JSON values. */
export function readSnapshot(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

export function ValueCapsule({ name, value }: { name: string; value: unknown }) {
  const { t } = useTranslation();
  const text = value === undefined ? t[RSC.AGENTS_NODE_VALUE_MISSING_TEXT]
    : value === null ? t[RSC.AGENTS_NODE_VALUE_NULL_TEXT]
    : value === "" ? t[RSC.AGENTS_NODE_VALUE_EMPTY_TEXT]
    : typeof value === "boolean" ? t[value ? RSC.AGENTS_NODE_VALUE_TRUE_TEXT : RSC.AGENTS_NODE_VALUE_FALSE_TEXT]
    : Array.isArray(value) ? "[]" : typeof value === "object" ? "{}" : String(value);
  return <Box component="span" data-testid="node-value-capsule" sx={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline", columnGap: .625, maxWidth: "100%", minWidth: 0, px: 1.125, py: .5, borderRadius: 2.5, border: "1px solid", borderColor: "divider", bgcolor: "background.default", fontSize: ".8125rem", lineHeight: 1.6, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
    <Box component="span" sx={{ color: "text.secondary" }}>{name}{":"}</Box>
    <Box component="span" dir="auto" sx={{ color: "text.primary", minWidth: 0 }}>{text}</Box>
  </Box>;
}

/** Keep object groups and array indices; never truncate opaque adapter fields. */
export function JsonCapsules({ value, name }: { value: unknown; name: string }) {
  const { t } = useTranslation();
  const entries = value !== null && typeof value === "object"
    ? Array.isArray(value) ? value.map((item, index) => [`[${index}]`, item] as const) : Object.entries(value)
    : [];
  if (entries.length === 0) return <ValueCapsule name={name} value={value} />;
  return <Box sx={{ minWidth: 0, display: "flex", flexWrap: "wrap", gap: .75 }}>
    {entries.map(([key, item]) => item === null || typeof item !== "object" || Object.keys(item).length === 0
      ? <ValueCapsule key={key} name={key} value={item} />
      : <Box key={key} component="section" aria-label={key} sx={{ flexBasis: "100%", mt: .5, borderInlineStart: "2px solid", borderColor: "divider", paddingInlineStart: 1.25, minWidth: 0 }}>
      <Typography component="h5" variant="caption" color="text.secondary" sx={{ display: "block", mb: .75, overflowWrap: "anywhere" }}>{key}{Array.isArray(item) && ` · ${item.length} ${t[RSC.AGENTS_NODE_VALUE_ITEMS_TEXT]}`}</Typography>
      <JsonCapsules value={item} name={key} />
    </Box>)}
  </Box>;
}
