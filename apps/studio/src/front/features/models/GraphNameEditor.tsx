import { Alert, Box, Button, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import { graphInventory, type RenameTarget } from "@p4studio/studio_domain/front";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { Icon } from "../../shared/components/Icon.js";
import { RSC } from "./resource.js";

export function GraphNameEditor({ target, name }: { target: RenameTarget; name: string }) {
  const { t } = useTranslation();
  const draft = useModel(graphInventory.draft).value;
  const active = draft && draft.target.kind === target.kind && draft.target.agentId === target.agentId && (target.kind === "agent" || (draft.target.kind === "node" && draft.target.nodeId === target.nodeId));
  const label = t[target.kind === "agent" ? RSC.MODELS_GRAPH_AGENT_NAME_LABEL : RSC.MODELS_GRAPH_NODE_NAME_LABEL];
  return <Box className="nodrag nopan" onClick={event => { if (active) event.stopPropagation(); }} onKeyDown={event => event.stopPropagation()} sx={{ display: "flex", alignItems: "center", minWidth: 0, gap: .25, flex: 1 }}>
    {active ? <Box sx={{ display: "flex", alignItems: "center", gap: .25, width: "100%" }}>
      <TextField autoFocus size="small" label={label} value={draft.name} disabled={draft.busy} error={draft.failed} title={draft.failed ? t[RSC.MODELS_GRAPH_RENAME_ERROR_ALERT] : label}
        slotProps={{ htmlInput: { maxLength: 80 }, input: { sx: { fontSize: 12, height: 32 } } }} sx={{ minWidth: 60, flex: 1 }}
        onChange={event => graphInventory.draft.mutate(value => { value!.name = event.target.value; value!.failed = false; })}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void graphInventory.saveName(); } if (event.key === "Escape") { event.preventDefault(); graphInventory.cancel(); } }} />
      <Button size="small" disabled={draft.busy || !draft.name.trim()} onClick={() => void graphInventory.saveName()} sx={{ minWidth: 0, px: .5 }}>{t[RSC.MODELS_GRAPH_SAVE_BUTTON]}</Button>
      <Button size="small" disabled={draft.busy} onClick={() => graphInventory.cancel()} sx={{ minWidth: 0, px: .5 }}>{t[RSC.MODELS_CANCEL_BUTTON]}</Button>
    </Box> : <>
      <Typography variant="body2" noWrap title={name} sx={{ minWidth: 0, fontWeight: 600 }}>{name}</Typography>
      <Tooltip title={`${label} ${t[RSC.MODELS_GRAPH_RENAME_BUTTON]}`}><IconButton size="small" aria-label={`${name} ${t[RSC.MODELS_GRAPH_RENAME_BUTTON]}`} onClick={event => { event.stopPropagation(); graphInventory.edit(target, name); }}><Icon name="edit" sx={{ fontSize: 15 }} /></IconButton></Tooltip>
    </>}
  </Box>;
}

export function GraphFeedback() {
  const { t } = useTranslation();
  const draft = useModel(graphInventory.draft).value;
  const labelError = useModel(graphInventory.labelError).value;
  return <>
    {draft?.failed && <Alert severity="error">{t[RSC.MODELS_GRAPH_RENAME_ERROR_ALERT]}</Alert>}
    {labelError && <Alert severity="error" action={<Button onClick={() => void graphInventory.loadLabels()}>{t[RSC.MODELS_GRAPH_RELOAD_BUTTON]}</Button>}>{t[RSC.MODELS_GRAPH_LABELS_ERROR_ALERT]}</Alert>}
  </>;
}
