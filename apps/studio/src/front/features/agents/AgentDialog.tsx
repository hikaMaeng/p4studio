import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation.js";
import { studioApi } from "../../shared/api/client.js";
import { RSC } from "./resource.js";

export const AgentDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void | Promise<void> }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(""); const [host, setHost] = useState(""); const [port, setPort] = useState("52211"); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await studioApi.createAgent({ name, host, port: Number(port) }); setName(""); setHost(""); await onCreated(); } catch { setError(t[RSC.AGENTS_REGISTER_FAILURE_ALERT]); } finally { setBusy(false); } };
  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="agent-dialog-title"><form onSubmit={(event) => void submit(event)}><DialogTitle id="agent-dialog-title">{t[RSC.AGENTS_REGISTER_TITLE_TEXT]}</DialogTitle><DialogContent sx={{ display: "grid", gap: 2, pt: "10px !important" }}>{error && <Alert severity="error" role="alert">{error}</Alert>}<TextField label={t[RSC.AGENTS_NAME_LABEL]} value={name} onChange={(event) => setName(event.target.value)} required autoFocus /><TextField label={t[RSC.AGENTS_HOST_LABEL]} value={host} onChange={(event) => setHost(event.target.value)} required /><TextField label={t[RSC.AGENTS_PORT_LABEL]} value={port} onChange={(event) => setPort(event.target.value)} required type="number" slotProps={{ htmlInput: { min: 1, max: 65535 } }} /></DialogContent><DialogActions sx={{ p: 2.5 }}><Button onClick={onClose} color="secondary">{t[RSC.AGENTS_CANCEL_BUTTON]}</Button><Button type="submit" variant="contained" disabled={busy}>{t[busy ? RSC.AGENTS_REGISTERING_STATUS : RSC.AGENTS_REGISTER_BUTTON]}</Button></DialogActions></form></Dialog>;
};
