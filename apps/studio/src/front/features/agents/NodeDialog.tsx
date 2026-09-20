import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { AgentRecord } from "../../../common/domain.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { routePath } from "../../shell/routes.js";
import { RSC } from "./resource.js";

// Old deep links remain reviewable; node creation now belongs to model placement LOAD.
export const NodeDialog = ({ agent, onClose }: { agent: AgentRecord | null; onClose: () => void; onCreated: () => void | Promise<void> }) => {
  const { t } = useTranslation();
  return <Dialog open={Boolean(agent)} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="node-dialog-title">
    <DialogTitle id="node-dialog-title">{formatMessage(t[RSC.AGENTS_NODE_DECLARE_TITLE_TEXT], { name: agent?.name ?? "" })}</DialogTitle>
    <DialogContent><Alert severity="info">{t[RSC.AGENTS_NODE_LIFECYCLE_MESSAGE]}</Alert></DialogContent>
    <DialogActions><Button onClick={onClose}>{t[RSC.AGENTS_CANCEL_BUTTON]}</Button><Button component="a" href={routePath({ kind: "model-new" })}>{t[RSC.AGENTS_NODE_PLACEMENT_BUTTON]}</Button></DialogActions>
  </Dialog>;
};
