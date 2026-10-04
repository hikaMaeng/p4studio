import { Box, Typography } from "@mui/material";

export function MenuHeader({ title, meta, actions }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return <Box component="header" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, minWidth: 0, minHeight: 32, mb: 1.5 }}>
    <Box sx={{ display: "flex", alignItems: "baseline", gap: .75, minWidth: 0, flex: "1 1 auto" }}>
      <Typography component="h1" variant="subtitle1" noWrap sx={{ minWidth: 0, fontSize: ".95rem", lineHeight: 1.25, fontWeight: 500 }}>{title}</Typography>
      {meta}
    </Box>
    {actions && <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: .5, flex: "0 0 auto", minWidth: 0, whiteSpace: "nowrap" }}>{actions}</Box>}
  </Box>;
}
