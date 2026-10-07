import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Typography } from "@mui/material";
import { useEffect } from "react";
import { requestsForModel } from "@p4studio/studio_domain/front";
import type { DeploymentRecord } from "@p4studio/studio_domain/common";
import { useModel } from "../../../model/useModel.js";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { formatMessage } from "../../../i18n/format.js";
import { navigate } from "../../../shell/routes.js";
import { requestsGateway } from "./api.js";
import { RSC } from "./resource.js";

export function PendingRequests({ record, busy, agentNames }: { record: DeploymentRecord; busy: boolean; agentNames: Record<string, string> }) {
  const model = requestsForModel(record.id), data = useModel(model.data).value, activity = useModel(model.activity).value, confirmation = useModel(model.confirmation).value, { t } = useTranslation();
  useEffect(() => model.watch(record, requestsGateway), [model]);
  useEffect(() => model.update(record), [model, record]);
  const value = (count: number | null | undefined) => count === null || count === undefined ? t[RSC.MODELS_REQUESTS_UNKNOWN_TEXT] : String(count);
  const head = data.stages[0], observed = head?.requests, pending = head?.pending;
  const unsettled = !data.observedAt || data.owners.some(owner => owner.pending === null) ? null : data.owners.reduce((sum, owner) => sum + (owner.pending ?? 0), 0);
  const hasWork = data.owners.length > 0 || data.stages.some(stage => [stage.requests, stage.pending, stage.activeOwners, stage.flights].some(count => count !== null && count > 0));
  const disabled = busy || activity.clearing;
  return <Box data-testid="model-pending-requests" sx={{ px: 1.5, py: .5, display: "grid", gap: .5 }}>
    <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      <Typography variant="caption" data-testid="model-pending-summary">{formatMessage(t[RSC.MODELS_REQUESTS_SUMMARY_MESSAGE], { unsettled: value(unsettled), requests: value(observed), pending: value(pending), owners: data.owners.length })}</Typography>
      {data.observedAt && <Typography variant="caption" color="text.secondary">{formatMessage(t[RSC.MODELS_REQUESTS_TIME_MESSAGE], { time: new Date(head?.observedAt ?? data.observedAt).toLocaleTimeString() })}</Typography>}
      <Button size="small" disabled={disabled || activity.inspecting} onClick={() => void model.refresh(true)}>{t[RSC.MODELS_REQUESTS_REFRESH_BUTTON]}</Button>
      <Button data-testid="model-requests-clear" size="small" color="warning" disabled={disabled || !hasWork} onClick={() => model.confirmation.set(true)}>{t[RSC.MODELS_REQUESTS_CLEAR_BUTTON]}</Button>
    </Box>
    {activity.clearing && <LinearProgress aria-label={t[RSC.MODELS_REQUESTS_CLEAR_BUTTON]} />}
    {activity.cleared && <Alert severity="success">{t[RSC.MODELS_REQUESTS_CLEARED_MESSAGE]}</Alert>}
    {activity.inspectionError && <Alert severity="warning" role="alert">{t[RSC.MODELS_REQUESTS_INSPECTION_ERROR_MESSAGE]} {activity.inspectionError}</Alert>}
    {activity.error && <Alert severity="warning" role="alert">{t[RSC.MODELS_REQUESTS_ERROR_MESSAGE]} {activity.error}<Box>{[...new Set(record.stages.map(stage => stage.agentId))].map(agentId => <Button key={agentId} onClick={() => navigate({ kind: "agent-recovery", agentId })}>{t[RSC.MODELS_REQUESTS_RECOVERY_BUTTON]} · {agentNames[agentId] ?? agentId}</Button>)}</Box></Alert>}
    {hasWork && <Box data-testid="model-pending-details">
      {data.stages.map(stage => <Typography key={stage.stageId} variant="caption" sx={{ display: "block" }}>{formatMessage(t[RSC.MODELS_REQUESTS_STAGE_MESSAGE], { node: stage.nodeId, requests: value(stage.requests), pending: value(stage.pending), active: value(stage.activeOwners), flights: value(stage.flights) })}{stage.detail ? ` · ${stage.detail}` : ""}</Typography>)}
      {data.owners.map(owner => <Typography variant="caption" sx={{ display: "block" }} key={owner.operationId}>{formatMessage(t[RSC.MODELS_REQUESTS_OWNERS_MESSAGE], { id: owner.operationId, load: owner.loadGeneration, submitted: value(owner.submitted), live: owner.live ? "✓" : "—", checkpoint: owner.checkpointAt ? new Date(owner.checkpointAt).toLocaleString() : t[RSC.MODELS_REQUESTS_UNKNOWN_TEXT] })}</Typography>)}
      <Typography variant="caption" color="text.secondary">{t[RSC.MODELS_REQUESTS_HISTORY_MESSAGE]}</Typography>
    </Box>}
    <Dialog open={confirmation} onClose={() => model.confirmation.set(false)} aria-labelledby={`requests-clear-${record.id}`}>
      <DialogTitle id={`requests-clear-${record.id}`}>{t[RSC.MODELS_REQUESTS_CONFIRM_TITLE]}</DialogTitle>
      <DialogContent><Typography>{record.name}</Typography><Alert severity="warning">{t[RSC.MODELS_REQUESTS_WARNING_MESSAGE]}</Alert></DialogContent>
      <DialogActions><Button onClick={() => model.confirmation.set(false)}>{t[RSC.MODELS_REQUESTS_CANCEL_BUTTON]}</Button><Button data-testid="model-requests-clear-confirm" color="warning" disabled={disabled} onClick={() => void model.clear()}>{t[RSC.MODELS_REQUESTS_CONFIRM_BUTTON]}</Button></DialogActions>
    </Dialog>
  </Box>;
}
