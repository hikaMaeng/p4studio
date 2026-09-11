import { SliceModel } from "../SliceModel.js";
import type { InferenceMonitoring, InferenceRun, InferenceRunInput } from "../../../common/protocol/inference/index.js";

export interface InferenceGateway {
  list(): Promise<InferenceRun[]>;
  create(input: InferenceRunInput): Promise<InferenceRun>;
  subscribe(runId: string, onRun: (run: InferenceRun) => void, onError: (error: Error) => void): () => void;
  monitoring(modelId: string): Promise<InferenceMonitoring>;
}

class InferenceStore {
  readonly runs = new SliceModel<InferenceRun[]>([]);
  readonly monitoring = new SliceModel<InferenceMonitoring | null>(null);
  readonly activity = new SliceModel({ busy: false, error: "" });
  private gateway?: InferenceGateway;
  private subscriptions = new Map<string, () => void>();
  private monitoringTimers = new Map<string, ReturnType<typeof setInterval>>();

  start(gateway: InferenceGateway) { if (!this.gateway) { this.gateway = gateway; void this.refresh(); } }
  async refresh() {
    if (!this.gateway) return;
    try { const runs = await this.gateway.list(); this.runs.set(runs); runs.filter(run => ["preparing", "running"].includes(run.state)).forEach(run => { this.listen(run); this.startMonitoring(run); }); }
    catch (error) { this.activity.mutate(value => { value.error = String(error); }); }
  }
  async create(input: InferenceRunInput) {
    if (!this.gateway || this.activity.value.busy) return;
    this.activity.mutate(value => { value.busy = true; value.error = ""; });
    try { const run = await this.gateway.create(input); this.upsert(run); this.listen(run); this.startMonitoring(run); }
    catch (error) { this.activity.mutate(value => { value.error = error instanceof Error ? error.message : String(error); }); }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
  async refreshMonitoring(modelId: string) {
    if (!this.gateway) return;
    try { const snapshot = await this.gateway.monitoring(modelId); this.monitoring.set(snapshot); this.runs.mutate(values => values.filter(run => run.modelId === modelId && ["preparing", "running"].includes(run.state)).forEach(run => run.monitoring.push(snapshot))); }
    catch (error) { this.activity.mutate(value => { value.error = error instanceof Error ? error.message : String(error); }); }
  }
  private listen(run: InferenceRun) {
    if (!this.gateway || this.subscriptions.has(run.id)) return;
    this.subscriptions.set(run.id, this.gateway.subscribe(run.id, value => { this.upsert(value); if (!["preparing", "running"].includes(value.state)) { this.stop(value.id); this.stopMonitoring(value.id); } }, error => this.activity.mutate(value => { value.error = error.message; })));
  }
  private startMonitoring(run: InferenceRun) { if (!this.gateway || this.monitoringTimers.has(run.modelId)) return; const poll = () => void this.refreshMonitoring(run.modelId); void this.refreshMonitoring(run.modelId); this.monitoringTimers.set(run.modelId, globalThis.setInterval(poll, 2000)); }
  private stopMonitoring(id: string) { const run = this.runs.value.find(value => value.id === id); if (!run || this.runs.value.some(value => value.id !== id && value.modelId === run.modelId && ["preparing", "running"].includes(value.state))) return; const timer = this.monitoringTimers.get(run.modelId); if (timer !== undefined) { globalThis.clearInterval(timer); this.monitoringTimers.delete(run.modelId); } }
  private stop(id: string) { this.subscriptions.get(id)?.(); this.subscriptions.delete(id); }
  private upsert(run: InferenceRun) { this.runs.mutate(values => { const index = values.findIndex(value => value.id === run.id); if (index < 0) values.unshift(run); else values[index] = run; }); }
}

export const inference = new InferenceStore();
