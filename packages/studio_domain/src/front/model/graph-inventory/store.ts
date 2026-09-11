import type { P4AgentSnapshot } from "@p4studio/p4-protocol";
import type { GraphAgent, NodeLabel, NodeLabelInput } from "../../../common/protocol/graph-inventory/index.js";
import { nodeLabelKey } from "../../../common/protocol/graph-inventory/index.js";
import { SliceModel } from "../SliceModel.js";

export type RenameTarget = { kind: "agent"; agentId: string } | { kind: "node"; agentId: string; nodeId: string };
export interface GraphInventoryGateway {
  inspect(agent: GraphAgent): Promise<P4AgentSnapshot>;
  labels(): Promise<NodeLabel[]>;
  renameAgent(id: string, name: string): Promise<GraphAgent>;
  renameNode(id: string, input: NodeLabelInput): Promise<NodeLabel>;
}
// See apps/studio/docs/usage.md#managed-metadata: names are not P4 identity or observations.
export class GraphInventoryStore {
  readonly names = new SliceModel(new Map<string, string>());
  readonly labels = new SliceModel(new Map<string, NodeLabel>());
  readonly observations = new SliceModel(new Map<string, { snapshot: P4AgentSnapshot; inspectedAt: string }>());
  readonly refreshState = new SliceModel(new Map<string, { busy: boolean; error: string | null }>());
  readonly draft = new SliceModel<{ target: RenameTarget; name: string; busy: boolean; failed: boolean } | null>(null);
  readonly labelError = new SliceModel(false);
  private gateway?: GraphInventoryGateway;
  start(gateway: GraphInventoryGateway) {
    if (this.gateway) return;
    this.gateway = gateway;
    void this.loadLabels();
  }
  async loadLabels() {
    try {
      const labels = await this.gateway!.labels();
      this.labels.mutate(values => { for (const label of labels) {
        const current = values.get(nodeLabelKey(label.agentId, label.nodeId));
        if (!current || current.updatedAt <= label.updatedAt) values.set(nodeLabelKey(label.agentId, label.nodeId), label);
      } });
      this.labelError.set(false);
    } catch { this.labelError.set(true); }
  }
  async refresh(agent: GraphAgent) {
    if (!this.gateway || this.refreshState.value.get(agent.id)?.busy) return;
    this.refreshState.mutate(values => values.set(agent.id, { busy: true, error: null }));
    try {
      const snapshot = await this.gateway.inspect(agent);
      this.observations.mutate(values => values.set(agent.id, { snapshot, inspectedAt: new Date().toISOString() }));
      this.refreshState.mutate(values => values.set(agent.id, { busy: false, error: null }));
    } catch (error) {
      // Keep the last observation and the deployment draft on failed refresh.
      this.refreshState.mutate(values => values.set(agent.id, { busy: false, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  edit(target: RenameTarget, name: string) {
    if (!this.draft.value?.busy) this.draft.set({ target, name, busy: false, failed: false });
  }
  cancel() { if (!this.draft.value?.busy) this.draft.set(null); }
  async saveName() {
    const draft = this.draft.value;
    if (!draft || !this.gateway || draft.busy || !draft.name.trim()) return;
    this.draft.mutate(value => { value!.busy = true; value!.failed = false; });
    try {
      if (draft.target.kind === "agent") {
        const result = await this.gateway.renameAgent(draft.target.agentId, draft.name.trim());
        this.names.mutate(values => values.set(result.id, result.name));
      } else {
        const result = await this.gateway.renameNode(draft.target.agentId, { nodeId: draft.target.nodeId, name: draft.name.trim() });
        this.labels.mutate(values => values.set(nodeLabelKey(result.agentId, result.nodeId), result));
      }
      this.draft.set(null);
    } catch { this.draft.mutate(value => { value!.busy = false; value!.failed = true; }); }
  }
}
export const graphInventory = new GraphInventoryStore();
