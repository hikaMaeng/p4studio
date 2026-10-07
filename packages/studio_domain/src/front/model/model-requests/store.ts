import type { DeploymentRecord } from "../../../common/protocol/deployments/index.js";
import type { ModelRequestOwner, StageRequestWork } from "../../../common/protocol/model-requests/index.js";
import { SliceModel } from "../SliceModel.js";

export type ModelRequestsGateway = {
  inspect(record: DeploymentRecord, fresh?: boolean): Promise<{ owners: ModelRequestOwner[]; stages: StageRequestWork[]; observedAt: string }>;
  clear(record: DeploymentRecord): Promise<void>;
};
class ModelRequests {
  readonly data = new SliceModel<{ owners: ModelRequestOwner[]; stages: StageRequestWork[]; observedAt: string | null }>({ owners: [], stages: [], observedAt: null });
  readonly activity = new SliceModel({ inspecting: false, clearing: false, error: "", inspectionError: "", cleared: false });
  readonly confirmation = new SliceModel(false);
  private record: DeploymentRecord | undefined;
  private gateway: ModelRequestsGateway | undefined;
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  watch(record: DeploymentRecord, gateway: ModelRequestsGateway) {
    this.update(record); this.gateway = gateway; this.watchers++;
    if (this.watchers === 1) { void this.refresh(); this.timer = setInterval(() => void this.refresh(), 10_000); }
    return () => { if (--this.watchers === 0) { clearInterval(this.timer); this.timer = undefined; } };
  }
  update(record: DeploymentRecord) {
    if (this.record && (this.record.loadGeneration !== record.loadGeneration || JSON.stringify(this.record.stages) !== JSON.stringify(record.stages))) {
      this.data.set({ owners: [], stages: [], observedAt: null }); this.activity.mutate(v => { v.cleared = false; });
    }
    this.record = structuredClone(record);
  }
  async refresh(fresh = false) {
    if (!this.record || !this.gateway || this.activity.value.inspecting || this.activity.value.clearing) return;
    const record = structuredClone(this.record);
    this.activity.mutate(v => { v.inspecting = true; });
    try {
      const data = await this.gateway.inspect(record, fresh);
      if (this.record.loadGeneration === record.loadGeneration && JSON.stringify(this.record.stages) === JSON.stringify(record.stages)) this.data.set(data);
      this.activity.mutate(v => { v.inspectionError = ""; });
    } catch (error) { this.activity.mutate(v => { v.inspectionError = String(error); }); }
    finally { this.activity.mutate(v => { v.inspecting = false; }); }
  }
  async clear() {
    if (!this.record || !this.gateway || this.activity.value.clearing) return;
    this.confirmation.set(false); this.activity.mutate(v => { v.clearing = true; v.error = ""; v.cleared = false; });
    try { await this.gateway.clear(structuredClone(this.record)); this.activity.mutate(v => { v.cleared = true; }); }
    catch (error) { this.activity.mutate(v => { v.error = String(error); }); }
    finally { this.activity.mutate(v => { v.clearing = false; }); await this.refresh(); }
  }
}
const registry = new Map<string, ModelRequests>();
export function requestsForModel(id: string) { let value = registry.get(id); if (!value) { value = new ModelRequests(); registry.set(id, value); } return value; }
