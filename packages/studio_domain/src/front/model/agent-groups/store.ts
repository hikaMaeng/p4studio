import { SliceModel } from "../SliceModel.js";
import type { AgentGroup, AgentGroupInput } from "../../../common/protocol/agent-groups/index.js";
import type { GraphAgentList } from "../../../common/protocol/graph-inventory/index.js";

export interface AgentGroupsGateway {
  list(): Promise<GraphAgentList>;
  save(input: AgentGroupInput, id?: string): Promise<AgentGroup>;
  remove(id: string): Promise<void>;
}
export class AgentGroupsStore {
  readonly topology = new SliceModel<GraphAgentList>({ agents: [], groups: [] });
  readonly activity = new SliceModel({ loading: false, loaded: false, busy: false, error: false });
  readonly editor = new SliceModel<{ key: string; input: AgentGroupInput }>({ key: "", input: { name: "", gatewayAgentId: "", memberAgentIds: [] } });
  private gateway?: AgentGroupsGateway;
  start(gateway: AgentGroupsGateway) { this.gateway = gateway; void this.refresh(); }
  async refresh() {
    if (!this.gateway || this.activity.value.loading) return;
    this.activity.mutate(value => { value.loading = true; value.error = false; });
    try { this.topology.set(await this.gateway.list()); this.activity.mutate(value => { value.loaded = true; }); }
    catch { this.activity.mutate(value => { value.error = true; }); }
    finally { this.activity.mutate(value => { value.loading = false; }); }
  }
  open(id?: string) {
    const key = id ?? "new";
    if (this.editor.value.key === key) return;
    const record = this.topology.value.groups.find(value => value.id === id);
    if (id && !record) return;
    this.editor.set({ key, input: record ? structuredClone(record) : { name: "", gatewayAgentId: "", memberAgentIds: [] } });
  }
  member(id: string, selected: boolean) {
    this.editor.mutate(({ input }) => {
      if (selected && !input.memberAgentIds.includes(id)) input.memberAgentIds.push(id);
      if (!selected) {
        input.memberAgentIds = input.memberAgentIds.filter(value => value !== id);
        if (input.gatewayAgentId === id) input.gatewayAgentId = "";
      }
    });
  }
  async save(id?: string) {
    if (!this.gateway || this.activity.value.busy) return;
    this.activity.mutate(value => { value.busy = true; value.error = false; });
    try {
      const group = await this.gateway.save(this.editor.value.input, id);
      this.editor.mutate(value => { value.key = ""; }); await this.refresh(); return group;
    } catch { this.activity.mutate(value => { value.error = true; }); }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
  async remove(id: string) {
    if (!this.gateway || this.activity.value.busy) return false;
    this.activity.mutate(value => { value.busy = true; value.error = false; });
    try { await this.gateway.remove(id); await this.refresh(); return true; }
    catch { this.activity.mutate(value => { value.error = true; }); return false; }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
}
export const agentGroups = new AgentGroupsStore();
