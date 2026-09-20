import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { nodeUnload, type NodeUnloadTarget } from "@p4studio/studio_domain/front";
import { useState } from "react";
import "../../p4/node-unload.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { useModel } from "../../model/useModel.js";
import { RSC } from "./resource.js";

export function NodeUnloadButton({ target, onCompleted }: { target: NodeUnloadTarget; onCompleted: () => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const state = useModel(nodeUnload.states).value.get(JSON.stringify([target.agentId, target.nodeId, target.nodeGeneration])) ?? { busy: false, error: null, succeeded: false };
  const confirm = async () => { if (await nodeUnload.unload(target)) { setOpen(false); await onCompleted(); } };
  return <><Button color="error" size="small" disabled={state.busy} onClick={() => setOpen(true)}>{t[RSC.AGENTS_NODE_UNLOAD_BUTTON]}</Button>
    <Dialog open={open} onClose={() => { if (!state.busy) setOpen(false); }} aria-labelledby="node-unload-title" aria-describedby="node-unload-description" fullWidth maxWidth="xs">
      <DialogTitle id="node-unload-title">{t[RSC.AGENTS_NODE_UNLOAD_TITLE_TEXT]}</DialogTitle>
      <DialogContent aria-busy={state.busy}><DialogContentText id="node-unload-description">{formatMessage(t[RSC.AGENTS_NODE_UNLOAD_CONFIRM_MESSAGE], { node: target.nodeId, generation: target.nodeGeneration })}</DialogContentText>
        <DialogContentText sx={{ mt: 1 }}>{t[RSC.AGENTS_NODE_UNLOAD_RECEIPT_MESSAGE]}</DialogContentText>
        {state.error && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{state.error}</Alert>}
      </DialogContent>
      <DialogActions><Button autoFocus disabled={state.busy} onClick={() => setOpen(false)}>{t[RSC.AGENTS_CANCEL_BUTTON]}</Button><Button color="error" variant="contained" disabled={state.busy} onClick={() => void confirm()}>{t[state.busy ? RSC.AGENTS_NODE_UNLOADING_STATUS : RSC.AGENTS_NODE_UNLOAD_BUTTON]}</Button></DialogActions>
    </Dialog></>;
}
