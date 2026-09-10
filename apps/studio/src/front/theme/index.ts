import { createTheme } from "@mui/material/styles";

const fontStack = 'Pretendard, "Noto Sans KR", "Noto Sans CJK SC", "Noto Sans Devanagari", "Noto Sans Arabic", "Segoe UI", sans-serif';
export const createStudioTheme = (direction: "ltr" | "rtl") => createTheme({
  direction,
  palette: { mode: "dark", background: { default: "#101010", paper: "#181818" }, primary: { main: "#f1f1f1", contrastText: "#111111" }, secondary: { main: "#a3a3a3" }, success: { main: "#74c991" }, warning: { main: "#d8b26e" }, error: { main: "#e78383" }, divider: "#2a2a2a", text: { primary: "#f0f0f0", secondary: "#9b9b9b", disabled: "#666666" }, action: { hover: "#252525", selected: "#2a2a2a" } },
  typography: { fontFamily: fontStack, h1: { fontFamily: fontStack, fontSize: "1.9rem", fontWeight: 560, letterSpacing: "-0.035em" }, h2: { fontFamily: fontStack, fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.015em" }, button: { textTransform: "none", fontWeight: 550 } },
  shape: { borderRadius: 10 },
  components: { MuiButton: { styleOverrides: { root: { boxShadow: "none", borderRadius: 8 } } }, MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } }, MuiDialog: { styleOverrides: { paper: { border: "1px solid #303030", backgroundColor: "#191919" } } }, MuiTextField: { defaultProps: { size: "small" } } }
});
