import { Box, Button, Divider, IconButton, ListItemText, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { LANGUAGE_CODES, type LanguageCode } from "@p4studio/studio_domain/front";
import { useTranslation } from "../i18n/useTranslation.js";
import { Icon } from "../shared/components/Icon.js";
import { RSC } from "./resource.js";

export type View = "overview" | "agents" | "models" | "inference";
const items: Array<{ id: View; key: RSC; icon: React.ReactNode }> = [
  { id: "overview", key: RSC.SHELL_NAVIGATION_OVERVIEW_BUTTON, icon: <Icon name="grid" fontSize="small" /> },
  { id: "agents", key: RSC.SHELL_NAVIGATION_AGENTS_BUTTON, icon: <Icon name="dns" fontSize="small" /> },
  { id: "models", key: RSC.SHELL_NAVIGATION_MODELS_BUTTON, icon: <Icon name="memory" fontSize="small" /> },
  { id: "inference", key: RSC.SHELL_NAVIGATION_INFERENCE_BUTTON, icon: <Icon name="bolt" fontSize="small" /> }
];
const languageKeys: Record<LanguageCode, RSC> = {
  en: RSC.SHELL_LANGUAGE_EN_TEXT, ko: RSC.SHELL_LANGUAGE_KO_TEXT, zh: RSC.SHELL_LANGUAGE_ZH_TEXT,
  es: RSC.SHELL_LANGUAGE_ES_TEXT, hi: RSC.SHELL_LANGUAGE_HI_TEXT, ar: RSC.SHELL_LANGUAGE_AR_TEXT,
  fr: RSC.SHELL_LANGUAGE_FR_TEXT, pt: RSC.SHELL_LANGUAGE_PT_TEXT
};

const LanguageSelector = () => {
  const { language, setLanguage, t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return <>
    <Tooltip title={t[RSC.SHELL_LANGUAGE_OPEN_BUTTON]}><IconButton aria-label={t[RSC.SHELL_LANGUAGE_OPEN_BUTTON]} aria-controls={anchor ? "language-menu" : undefined} aria-expanded={anchor ? "true" : undefined} aria-haspopup="menu" size="small" onClick={(event) => setAnchor(event.currentTarget)}><Icon name="globe" fontSize="small" /></IconButton></Tooltip>
    <Menu id="language-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} disablePortal={false} transitionDuration={0}
      anchorOrigin={{ vertical: "bottom", horizontal: language === "ar" ? "left" : "right" }}
      transformOrigin={{ vertical: "top", horizontal: language === "ar" ? "right" : "left" }}
      slotProps={{ list: { "aria-label": t[RSC.SHELL_LANGUAGE_MENU_LABEL] }, paper: { sx: { mt: .5, minWidth: 132 } } }}>
      {LANGUAGE_CODES.map((code) => <MenuItem key={code} selected={code === language} lang={code} onClick={() => { setLanguage(code); setAnchor(null); }}><ListItemText>{t[languageKeys[code]]}</ListItemText></MenuItem>)}
    </Menu>
  </>;
};

export const Navigation = ({ current, onChange }: { current: View; onChange: (view: View) => void }) => {
  const { t } = useTranslation();
  return <Box component="aside" sx={{ width: { xs: 72, md: 216 }, minWidth: 0, flexShrink: 0, bgcolor: "background.paper", borderInlineEnd: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", height: "100vh" }}>
    <Box sx={{ position: "relative", height: 68, display: "flex", alignItems: "center", px: { xs: 2, md: 2.5 }, gap: 1.25 }}>
      <Box sx={{ width: 26, height: 26, bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 1, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>{t[RSC.SHELL_BRAND_MARK_TEXT]}</Box>
      <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0, paddingInlineEnd: 3.5 }}><Typography sx={{ fontWeight: 650, lineHeight: 1.15 }}>{t[RSC.SHELL_BRAND_TITLE_TEXT]}</Typography><Typography variant="caption" color="text.secondary">{t[RSC.SHELL_BRAND_SUBTITLE_TEXT]}</Typography></Box>
      <Box sx={{ position: "absolute", insetInlineEnd: { xs: 4, md: 8 }, top: "50%", transform: "translateY(-50%)" }}><LanguageSelector /></Box>
    </Box>
    <Divider />
    <Box component="nav" aria-label={t[RSC.SHELL_NAVIGATION_PRIMARY_LABEL]} sx={{ px: 1.25, py: 2, flex: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" }, px: 1.25, mb: 1, fontWeight: 600 }}>{t[RSC.SHELL_NAVIGATION_WORKSPACE_TEXT]}</Typography>
      {items.map((item) => <Button key={item.id} aria-label={t[item.key]} aria-current={current === item.id ? "page" : undefined} onClick={() => onChange(item.id)} startIcon={item.icon} sx={{ width: "100%", minWidth: 0, justifyContent: { xs: "center", md: "flex-start" }, color: current === item.id ? "text.primary" : "text.secondary", bgcolor: current === item.id ? "action.selected" : "transparent", px: { xs: 1, md: 1.25 }, py: 1, mb: 0.5, "& .MuiButton-startIcon": { margin: { xs: 0, md: 0 }, marginInlineEnd: { xs: 0, md: 1.25 } }, "&:hover": { bgcolor: "action.hover" } }}><Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>{t[item.key]}</Box></Button>)}
    </Box>
    <Box sx={{ p: 1.25 }}><Button aria-label={t[RSC.SHELL_NAVIGATION_SETTINGS_BUTTON]} startIcon={<Icon name="settings" fontSize="small" />} sx={{ width: "100%", minWidth: 0, justifyContent: { xs: "center", md: "flex-start" }, color: "text.secondary", px: { xs: 1, md: 1.25 }, "& .MuiButton-startIcon": { margin: { xs: 0, md: 0 }, marginInlineEnd: { xs: 0, md: 1.25 } } }}><Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>{t[RSC.SHELL_NAVIGATION_SETTINGS_BUTTON]}</Box></Button></Box>
  </Box>;
};
