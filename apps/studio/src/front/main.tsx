import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { directionForLanguage } from "@p4studio/studio_domain/front";
import { useTranslation } from "./i18n/useTranslation.js";
import { App } from "./shell/App.js";
import { createStudioTheme } from "./theme/index.js";
import "./theme/global.css";

const StudioRoot = () => {
  const { language } = useTranslation();
  const theme = useMemo(() => createStudioTheme(directionForLanguage(language)), [language]);
  return <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>;
};
createRoot(document.getElementById("root")!).render(<StrictMode><StudioRoot /></StrictMode>);
