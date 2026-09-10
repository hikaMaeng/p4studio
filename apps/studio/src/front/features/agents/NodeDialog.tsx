import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import type { AgentRecord } from "../../../common/domain.js";
import { formatMessage } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { studioApi } from "../../shared/api/client.js";
import { RSC } from "./resource.js";
import { RSC as COMMON_RSC } from "../../shared/components/resource.js";

export const NodeDialog = ({ agent, onClose, onCreated }: { agent: AgentRecord | null; onClose: () => void; onCreated: () => void | Promise<void> }) => {
  const { t } = useTranslation(); const [name, setName] = useState(""); const [adapter, setAdapter] = useState("llamacpp"); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!agent) return; setBusy(true); setError(null); try { await studioApi.createNode(agent.id, { name, adapter }); setName(""); await onCreated(); } catch { setError(t[RSC.AGENTS_NODE_FAILURE_ALERT]); } finally { setBusy(false); } };
  return <Dialog open={Boolean(agent)} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="node-dialog-title"><form onSubmit={(event) => void submit(event)}><DialogTitle id="node-dialog-title">{formatMessage(t[RSC.AGENTS_NODE_DECLARE_TITLE_TEXT], { name: agent?.name ?? "" })}</DialogTitle><DialogContent sx={{ display: "grid", gap: 2, pt: "10px !important" }}>{error && <Alert severity="error" role="alert">{error}</Alert>}<TextField label={t[RSC.AGENTS_NODE_NAME_LABEL]} value={name} onChange={(event) => setName(event.target.value)} required autoFocus /><TextField select label={t[RSC.AGENTS_ADAPTER_LABEL]} value={adapter} onChange={(event) => setAdapter(event.target.value)}><MenuItem value="llamacpp">{t[COMMON_RSC.COMMON_ADAPTER_LLAMACPP_TEXT]}</MenuItem><MenuItem value="vllm">{t[COMMON_RSC.COMMON_ADAPTER_VLLM_TEXT]}</MenuItem><MenuItem value="sglang">{t[COMMON_RSC.COMMON_ADAPTER_SGLANG_TEXT]}</MenuItem><MenuItem value="mock">{t[COMMON_RSC.COMMON_ADAPTER_MOCK_TEXT]}</MenuItem></TextField></DialogContent><DialogActions sx={{ p: 2.5 }}><Button onClick={onClose} color="secondary">{t[RSC.AGENTS_CANCEL_BUTTON]}</Button><Button type="submit" variant="contained" disabled={busy}>{t[busy ? RSC.AGENTS_NODE_DECLARING_STATUS : RSC.AGENTS_NODE_DECLARE_BUTTON]}</Button></DialogActions></form></Dialog>;
};
