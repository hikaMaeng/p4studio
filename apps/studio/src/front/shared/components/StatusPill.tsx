import { Box, Typography } from "@mui/material";
import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";

const colors: Record<string, string> = { reachable: "success.main", ready: "success.main", loading: "warning.main", unreachable: "error.main", error: "error.main", draft: "text.secondary", unknown: "text.disabled", declared: "text.secondary", pending: "warning.main" };
const statusKeys: Record<string, RSC> = {
  reachable: RSC.COMMON_STATUS_REACHABLE_STATUS, unreachable: RSC.COMMON_STATUS_UNREACHABLE_STATUS,
  ready: RSC.COMMON_STATUS_READY_STATUS, loading: RSC.COMMON_STATUS_LOADING_STATUS,
  error: RSC.COMMON_STATUS_ERROR_STATUS, draft: RSC.COMMON_STATUS_DRAFT_STATUS,
  unknown: RSC.COMMON_STATUS_UNKNOWN_STATUS, declared: RSC.COMMON_STATUS_DECLARED_STATUS,
  pending: RSC.COMMON_STATUS_PENDING_STATUS
};

export const StatusPill = ({ value, label }: { value: string; label?: string }) => {
  const { t } = useTranslation();
  const key = statusKeys[value] ?? RSC.COMMON_STATUS_UNKNOWN_STATUS;
  return <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, py: 0.45, border: "1px solid", borderColor: "divider", borderRadius: 10 }}>
    <Box aria-hidden sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: colors[value] ?? "text.disabled" }} />
    <Typography component="span" variant="caption" color="text.secondary">{label ?? t[key]}</Typography>
  </Box>;
};
