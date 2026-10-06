import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import { useEffect } from "react";
import type { RecoveryOperation } from "../../../common/recovery.js";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { navigate } from "../../shell/routes.js";
import { recoveryFor } from "./model.js";
import { RSC } from "./resource.js";
const states: Record<RecoveryOperation["state"], RSC> = { prepared: RSC.RECOVERY_PREPARED_STATUS, stopping: RSC.RECOVERY_STOPPING_STATUS, starting: RSC.RECOVERY_STARTING_STATUS, verifying: RSC.RECOVERY_VERIFYING_STATUS, recovered: RSC.RECOVERY_RECOVERED_STATUS, failed: RSC.RECOVERY_FAILED_STATUS, unknown: RSC.RECOVERY_UNKNOWN_STATUS };
export function RecoveryView({ agentId, operationId }: { agentId: string; operationId?: string }) {
  const model = recoveryFor(agentId), data = useModel(model.data).value, activity = useModel(model.activity).value, { t } = useTranslation();
  useEffect(() => model.watch(), [model]);
  const operation = data.operations.find(value => value.id === operationId);
  return <Box data-testid="agent-recovery" sx={{ display: "grid", gap: 2 }}>
    <Button onClick={() => navigate({ kind: "agent-detail", agentId, tab: "information" })}>{t[RSC.RECOVERY_BACK_BUTTON]}</Button>
    <Typography variant="h2">{t[RSC.RECOVERY_TITLE_TEXT]}</Typography>
    <Alert severity="warning">{t[RSC.RECOVERY_WARNING_MESSAGE]}</Alert>
    {activity.error && <Alert role="alert" severity="error">{activity.error}</Alert>}
    {!data.configured ? <Alert severity="info">{t[RSC.RECOVERY_UNCONFIGURED_MESSAGE]}</Alert> : <Button data-testid="recovery-plan" disabled={activity.busy || data.operations.some(value => ["stopping", "starting", "verifying", "unknown"].includes(value.state))} onClick={() => void model.plan().then(value => { if (value) navigate({ kind: "agent-recovery", agentId, operationId: value.id }); })}>{t[RSC.RECOVERY_PLAN_BUTTON]}</Button>}
    {operationId && !operation && <Typography role="status">{t[RSC.RECOVERY_UNKNOWN_STATUS]}</Typography>}
    {operation && <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1 }} data-testid="recovery-operation">
      <Typography variant="h3">{operation.agentName} · {t[states[operation.state]]}</Typography><Typography component="code">{operation.id}</Typography>
      <Typography>{t[RSC.RECOVERY_IMPACT_LABEL]}</Typography>{operation.affected.map(value => <Typography key={value.modelId}>{value.modelName} · {value.loadGeneration} · {value.stageIds.length}</Typography>)}
      <Typography>{t[RSC.RECOVERY_BEFORE_LABEL]}: {operation.before.agentPid} · {operation.before.processes.length} · {operation.before.ports.join(", ")}</Typography>
      <Typography component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(operation.before, null, 2)}</Typography>
      {operation.after && <Typography>{t[RSC.RECOVERY_AFTER_LABEL]}: {operation.after.agentPid} · {operation.after.processes.length} · {operation.after.ports.join(", ")}</Typography>}
      {operation.firstError && <Alert severity="error">{operation.firstError}</Alert>}{operation.cleanupError && <Alert severity="warning">{operation.cleanupError}</Alert>}
      {operation.state === "prepared" && <Button data-testid="recovery-execute" disabled={activity.busy} color="warning" variant="contained" onClick={() => void model.execute(operation)}>{t[RSC.RECOVERY_EXECUTE_BUTTON]}</Button>}
      {["verifying", "unknown"].includes(operation.state) && operation.after && <Button data-testid="recovery-verify" disabled={activity.busy} onClick={() => void model.verify(operation)}>{t[RSC.RECOVERY_VERIFY_BUTTON]}</Button>}
      {operation.state === "unknown" && <Button disabled={activity.busy} onClick={() => void model.reprobe(operation)}>{t[RSC.RECOVERY_REPROBE_BUTTON]}</Button>}
      {operation.state === "unknown" && !operation.stopped && !operation.after && <Button data-testid="recovery-review-retry" disabled={activity.busy} onClick={() => void model.reviewRetry(operation)}>{t[RSC.RECOVERY_REVIEW_RETRY_BUTTON]}</Button>}
      {operation.state === "unknown" && operation.retry && <Box data-testid="recovery-retry-review"><Typography>{t[RSC.RECOVERY_CURRENT_LABEL]}: {operation.retry.before.agentPid} · {operation.retry.before.processes.length} · {operation.retry.before.ports.join(", ")}</Typography><Button data-testid="recovery-retry" color="warning" disabled={activity.busy} onClick={() => void model.retry(operation)}>{t[RSC.RECOVERY_RETRY_BUTTON]}</Button></Box>}
      {operation.state === "unknown" && operation.stopped && !operation.after && <Button data-testid="recovery-resume" disabled={activity.busy} onClick={() => void model.resume(operation)}>{t[RSC.RECOVERY_RESUME_BUTTON]}</Button>}
      {operation.state === "prepared" || operation.state === "unknown" && !operation.stopped && !operation.after ? <Button disabled={activity.busy} onClick={() => void model.cancel(operation)}>{t[RSC.RECOVERY_CANCEL_BUTTON]}</Button> : null}
    </Paper>}
    <Typography variant="h3">{t[RSC.RECOVERY_HISTORY_TEXT]}</Typography>{data.operations.map(value => <Button key={value.id} onClick={() => navigate({ kind: "agent-recovery", agentId, operationId: value.id })}>{value.createdAt} · {t[states[value.state]]}</Button>)}
  </Box>;
}
