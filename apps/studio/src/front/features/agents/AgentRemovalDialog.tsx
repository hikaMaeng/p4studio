import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { agentRemoval } from "@p4studio/studio_domain/front";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { formatMessage } from "../../i18n/format.js";
import { studioApi } from "../../shared/api/client.js";
import { navigate } from "../../shell/routes.js";
import { RSC } from "./resource.js";

export function AgentRemovalDialog({ onChanged }: { onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const { target, busy, error } = useModel(agentRemoval.dialog).value;
  const confirm = async () => {
    const removed = await agentRemoval.confirm(studioApi.deleteAgent);
    if (!removed) return;
    await onChanged();
    navigate({ kind: "agents" });
  };
  return <Dialog open={target !== null} onClose={() => agentRemoval.close()} aria-labelledby="agent-removal-title" aria-describedby="agent-removal-description" fullWidth maxWidth="xs">
    <DialogTitle id="agent-removal-title">{t[RSC.AGENTS_DELETE_TITLE_TEXT]}</DialogTitle>
    <DialogContent aria-busy={busy}>
      <DialogContentText id="agent-removal-description">{formatMessage(t[RSC.AGENTS_DELETE_CONFIRM_MESSAGE], { name: target?.name ?? "" })}</DialogContentText>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{t[error === "in_use" ? RSC.AGENTS_DELETE_IN_USE_ALERT : RSC.AGENTS_DELETE_FAILURE_ALERT]}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button autoFocus disabled={busy} onClick={() => agentRemoval.close()}>{t[RSC.AGENTS_CANCEL_BUTTON]}</Button>
      <Button color="error" variant="contained" disabled={busy} onClick={() => void confirm()}>{t[busy ? RSC.AGENTS_DELETING_STATUS : RSC.AGENTS_DELETE_BUTTON]}</Button>
    </DialogActions>
  </Dialog>;
}
