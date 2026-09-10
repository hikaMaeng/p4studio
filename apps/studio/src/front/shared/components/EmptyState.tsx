import { Box, Button, Typography } from "@mui/material";
import { Icon } from "./Icon.js";

export const EmptyState = ({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) => (
  <Box role="status" sx={{ minHeight: 220, border: "1px dashed", borderColor: "divider", borderRadius: 2, display: "grid", placeItems: "center", textAlign: "center", p: 2 }}>
    <Box>
      <Icon name="hub" sx={{ color: "text.disabled", fontSize: 32, mb: 1 }} />
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 420 }}>{detail}</Typography>
      {action && onAction && <Button startIcon={<Icon name="add" />} variant="outlined" size="small" onClick={onAction} sx={{ mt: 2 }}>{action}</Button>}
    </Box>
  </Box>
);
