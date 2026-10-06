import { SliceModel } from "../SliceModel.js";
import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";
export type DeploymentHistoryEntry = { revision: number; recordedAt: string; reason: string; record: DeploymentRecord };
export class DeploymentHistory {
  readonly page = new SliceModel(0);
  readonly entries = new SliceModel<DeploymentHistoryEntry[]>([]);
  readonly activity = new SliceModel({ busy: false, error: "" });
  async refresh(read: () => Promise<DeploymentHistoryEntry[]>) {
    if (this.activity.value.busy) return;
    this.activity.set({ busy: true, error: "" });
    try { this.entries.set(await read()); } catch (error) { this.activity.mutate(value => { value.error = String(error); }); }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
}
const histories = new Map<string, DeploymentHistory>();
export function deploymentHistory(id: string) { let value = histories.get(id); if (!value) { value = new DeploymentHistory(); histories.set(id, value); } return value; }
