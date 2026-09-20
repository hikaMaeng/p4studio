import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useEffect } from "react";
import { agentGroups } from "@p4studio/studio_domain/front";
import { useModel } from "../../model/useModel.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { navigate } from "../../shell/routes.js";
import { startAgentGroups } from "./api.js";
import { RSC } from "./resource.js";

export function AgentGroupsView({ groupId, editor }: { groupId?: string; editor?: boolean }) {
  const { t } = useTranslation();
  const topology = useModel(agentGroups.topology).value;
  const activity = useModel(agentGroups.activity).value;
  const draft = useModel(agentGroups.editor).value;
  useEffect(startAgentGroups, []);
  useEffect(() => { if (editor && activity.loaded) agentGroups.open(groupId); }, [editor, groupId, activity.loaded, topology]);
  const group = topology.groups.find(value => value.id === groupId);
  const back = () => navigate({ kind: "agent-groups" });
  const name = (id: string) => topology.agents.find(agent => agent.id === id)?.name ?? id;
  if (groupId !== undefined && activity.loaded && !group) return <Alert severity="warning">{t[RSC.GROUPS_MISSING_MESSAGE]}<Button onClick={back}>{t[RSC.GROUPS_BACK_BUTTON]}</Button></Alert>;
  return <Box component="section" aria-label={t[RSC.GROUPS_TITLE_TEXT]} sx={{ display: "grid", gap: 2 }}>
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography component="h1" variant="h2">{t[RSC.GROUPS_TITLE_TEXT]}</Typography>
      <Button onClick={() => navigate({ kind: "agents" })}>{t[RSC.GROUPS_AGENTS_BUTTON]}</Button>
    </Box>
    <Typography color="text.secondary">{t[RSC.GROUPS_PURPOSE_MESSAGE]}</Typography>
    {activity.error && <Alert severity="error">{t[RSC.GROUPS_FAILURE_ALERT]}</Alert>}
    {!activity.loaded && <Typography role="status">{t[RSC.GROUPS_LOADING_STATUS]}</Typography>}
    {editor && activity.loaded && draft.key === (groupId ?? "new") ? <Paper component="form" variant="outlined" onSubmit={event => { event.preventDefault(); void agentGroups.save(groupId).then(saved => { if (saved) navigate({ kind: "agent-group-detail", groupId: saved.id }); }); }} sx={{ p: 3, display: "grid", gap: 2, maxWidth: 720 }}>
      <TextField required label={t[RSC.GROUPS_NAME_LABEL]} value={draft.input.name} onChange={event => agentGroups.editor.mutate(value => { value.input.name = event.target.value; })} />
      <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}><Typography component="legend">{t[RSC.GROUPS_MEMBERS_LABEL]}</Typography>
        {topology.agents.map(agent => {
          const occupied = topology.groups.some(value => value.id !== groupId && value.memberAgentIds.includes(agent.id));
          return <FormControlLabel key={agent.id} label={agent.name} control={<Checkbox disabled={occupied || activity.busy} checked={draft.input.memberAgentIds.includes(agent.id)} onChange={event => agentGroups.member(agent.id, event.target.checked)} />} />;
        })}
      </Box>
      <TextField select required label={t[RSC.GROUPS_GATEWAY_LABEL]} value={draft.input.gatewayAgentId} onChange={event => agentGroups.editor.mutate(value => { value.input.gatewayAgentId = event.target.value; })}>
        {draft.input.memberAgentIds.map(id => <MenuItem key={id} value={id}>{name(id)}</MenuItem>)}
      </TextField>
      <Typography variant="body2" color="text.secondary">{t[RSC.GROUPS_GATEWAY_MESSAGE]}</Typography>
      <Box sx={{ display: "flex", gap: 1 }}><Button type="submit" variant="contained" disabled={activity.busy || !draft.input.gatewayAgentId}>{t[RSC.GROUPS_SAVE_BUTTON]}</Button><Button disabled={activity.busy} onClick={back}>{t[RSC.GROUPS_BACK_BUTTON]}</Button></Box>
    </Paper> : !editor && <>
      {!groupId && <Button sx={{ justifySelf: "start" }} variant="contained" onClick={() => navigate({ kind: "agent-group-new" })}>{t[RSC.GROUPS_CREATE_BUTTON]}</Button>}
      {!topology.groups.length && activity.loaded && <Typography>{t[RSC.GROUPS_EMPTY_MESSAGE]}</Typography>}
      {(group ? [group] : topology.groups).map(value => <Paper key={value.id} data-testid="agent-group" variant="outlined" sx={{ p: 2, display: "grid", gap: 1 }}>
        <Typography component="h2" variant="h2"><Button onClick={() => navigate({ kind: "agent-group-detail", groupId: value.id })}>{value.name}</Button></Typography>
        <Typography>{t[RSC.GROUPS_GATEWAY_LABEL]}: {name(value.gatewayAgentId)}</Typography>
        <Typography>{t[RSC.GROUPS_MEMBERS_LABEL]}: {value.memberAgentIds.map(name).join(", ")}</Typography>
        <Box><Button onClick={() => navigate({ kind: "agent-group-edit", groupId: value.id })}>{t[RSC.GROUPS_EDIT_BUTTON]}</Button>{groupId && <Button disabled={activity.busy} onClick={() => void agentGroups.remove(value.id).then(removed => { if (removed) back(); })}>{t[RSC.GROUPS_REMOVE_BUTTON]}</Button>}</Box>
        {groupId && <Typography variant="caption" color="text.secondary">{t[RSC.GROUPS_REMOVE_MESSAGE]}</Typography>}
      </Paper>)}
      {groupId && <Button sx={{ justifySelf: "start" }} onClick={back}>{t[RSC.GROUPS_BACK_BUTTON]}</Button>}
    </>}
  </Box>;
}
