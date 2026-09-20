import type { DatabaseSync } from "node:sqlite";
import { agentGroupInputSchema, type AgentGroup, type AgentGroupInput } from "@p4studio/studio_domain/common";

/** One membership per agent; gateway deletion is restricted even when it owns no nodes. */
export class AgentGroupRepository {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS agent_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      gateway_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS agent_group_members (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE RESTRICT,
      group_id TEXT NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE
    );`);
  }
  list(): AgentGroup[] {
    return this.db.prepare("SELECT * FROM agent_groups ORDER BY name").all().map(row => ({
      id: String(row.id), name: String(row.name), gatewayAgentId: String(row.gateway_agent_id),
      memberAgentIds: this.db.prepare("SELECT agent_id FROM agent_group_members WHERE group_id=? ORDER BY agent_id").all(String(row.id)).map(member => String(member.agent_id)),
    }));
  }
  save(input: AgentGroupInput, id: string = crypto.randomUUID()): AgentGroup {
    const parsed = agentGroupInputSchema.parse(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO agent_groups (id,name,gateway_agent_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,gateway_agent_id=excluded.gateway_agent_id").run(id, parsed.name, parsed.gatewayAgentId);
      this.db.prepare("DELETE FROM agent_group_members WHERE group_id=?").run(id);
      for (const member of parsed.memberAgentIds) this.db.prepare("INSERT INTO agent_group_members (agent_id,group_id) VALUES (?,?)").run(member, id);
      this.db.exec("COMMIT");
      return { id, ...parsed };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  remove(id: string) { return this.db.prepare("DELETE FROM agent_groups WHERE id=?").run(id).changes > 0; }
}
