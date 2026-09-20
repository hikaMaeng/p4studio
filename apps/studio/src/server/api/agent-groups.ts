import { Router } from "express";
import { agentGroupInputSchema, agentGroupRoutes, type AgentGroupError, type AgentGroupList } from "@p4studio/studio_domain/common";
import type { StudioDatabase } from "../database/client.js";

const rejected = (message: string): AgentGroupError => ({ error: { code: "agent_group_rejected", message } });
export function createAgentGroupRouter(database: StudioDatabase) {
  const router = Router(), repository = database.agentGroups;
  router.get(agentGroupRoutes.list.path.slice(4), (_req, res) => res.json({ groups: repository.list() } satisfies AgentGroupList));
  router.post(agentGroupRoutes.create.path.slice(4), (req, res) => {
    const input = agentGroupInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    try { return res.status(201).json(repository.save(input.data)); }
    catch { return res.status(409).json(rejected("Group name or agent membership conflicts, or an agent is missing")); }
  });
  router.put(agentGroupRoutes.update.path.slice(4), (req, res) => {
    const id = String(req.params.id);
    if (!repository.list().some(group => group.id === id)) return res.status(404).json(rejected("Group not found"));
    const input = agentGroupInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(rejected(input.error.message));
    try { return res.json(repository.save(input.data, id)); }
    catch { return res.status(409).json(rejected("Group name or agent membership conflicts, or an agent is missing")); }
  });
  router.delete(agentGroupRoutes.remove.path.slice(4), (req, res) => {
    if (!repository.remove(String(req.params.id))) return res.status(404).json(rejected("Group not found"));
    return res.status(204).end();
  });
  return router;
}
