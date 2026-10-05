import { SliceModel } from "../SliceModel.js";
import type { InferenceMonitoring, InferenceRun, InferenceRunInput } from "../../../common/protocol/inference/index.js";

export type InferenceObservabilitySnapshot = Pick<InferenceRun, "telemetrySeries" | "monitoring" | "monitoringSummary"> & {
  requestCount: number;
  coveredRequestCount: number;
};

const OBSERVABILITY_PUBLISH_INTERVAL_MS = 1000;
const observabilitySnapshot = (run: InferenceRun): InferenceObservabilitySnapshot => ({
  telemetrySeries: run.telemetrySeries,
  monitoring: run.monitoring,
  monitoringSummary: run.monitoringSummary,
  requestCount: run.requests.length,
  coveredRequestCount: run.requests.filter(request => request.telemetry.batchObservations || request.telemetry.stages.length).length,
});

export interface InferenceGateway {
  list(): Promise<InferenceRun[]>;
  create(input: InferenceRunInput): Promise<InferenceRun>;
  remove(runId: string): void;
  subscribe(runId: string, onRun: (run: InferenceRun) => void, onError: (error: Error) => void): () => void;
  monitoring(modelId: string): Promise<InferenceMonitoring>;
}

export class InferenceStore {
  readonly runs = new SliceModel<InferenceRun[]>([]);
  readonly runIds = new SliceModel<string[]>([]);
  readonly monitoring = new SliceModel<InferenceMonitoring | null>(null);
  readonly activity = new SliceModel({ busy: false, error: "" });
  private gateway?: InferenceGateway;
  private subscriptions = new Map<string, () => void>();
  private readonly runModels = new Map<string, SliceModel<InferenceRun | null>>();
  private readonly observabilityModels = new Map<string, SliceModel<InferenceObservabilitySnapshot | null>>();
  private readonly observabilityPublishedAt = new Map<string, number>();

  runModel(runId: string) {
    let model = this.runModels.get(runId);
    if (!model) {
      model = new SliceModel(this.runs.value.find(run => run.id === runId) ?? null);
      this.runModels.set(runId, model);
    }
    return model;
  }

  runObservabilityModel(runId: string) {
    let model = this.observabilityModels.get(runId);
    if (!model) {
      const run = this.runModel(runId).value;
      model = new SliceModel(run ? observabilitySnapshot(run) : null);
      this.observabilityModels.set(runId, model);
      this.observabilityPublishedAt.set(runId, Date.now());
    }
    return model;
  }

  start(gateway: InferenceGateway) { if (!this.gateway) { this.gateway = gateway; void this.refresh(); } }
  async refresh() {
    if (!this.gateway) return;
    try {
      const runs = await this.gateway.list();
      this.runs.set(runs);
      this.runIds.set(runs.map(run => run.id));
      const currentIds = new Set(runs.map(run => run.id));
      for (const [id, model] of this.runModels) {
        if (!currentIds.has(id)) { model.set(null); this.runModels.delete(id); }
      }
      for (const [id, model] of this.observabilityModels) {
        if (!currentIds.has(id)) { model.set(null); this.observabilityModels.delete(id); this.observabilityPublishedAt.delete(id); }
      }
      for (const run of runs) { this.runModel(run.id).set(run); this.publishObservability(run); }
      runs.filter(run => ["preparing", "running"].includes(run.state)).forEach(run => this.listen(run));
    }
    catch (error) { this.activity.mutate(value => { value.error = String(error); }); }
  }
  async create(input: InferenceRunInput) {
    if (!this.gateway || this.activity.value.busy) return;
    this.activity.mutate(value => { value.busy = true; value.error = ""; });
    try { const run = await this.gateway.create(input); this.upsert(run); this.listen(run); }
    catch (error) { this.activity.mutate(value => { value.error = error instanceof Error ? error.message : String(error); }); }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
  remove(runId: string) {
    this.stop(runId);
    this.gateway?.remove(runId);
    this.runs.set(values => values.filter(run => run.id !== runId));
    this.runIds.set(values => values.filter(id => id !== runId));
    this.runModel(runId).set(null);
    this.runModels.delete(runId);
    this.observabilityModels.get(runId)?.set(null);
    this.observabilityModels.delete(runId);
    this.observabilityPublishedAt.delete(runId);
  }
  async refreshMonitoring(modelId: string) {
    if (!this.gateway) return;
    try { const snapshot = await this.gateway.monitoring(modelId); this.monitoring.set(snapshot); }
    catch (error) { this.activity.mutate(value => { value.error = error instanceof Error ? error.message : String(error); }); }
  }
  private listen(run: InferenceRun) {
    if (!this.gateway || this.subscriptions.has(run.id)) return;
    this.subscriptions.set(run.id, this.gateway.subscribe(run.id, value => { this.upsert(value); const latest = value.monitoring.at(-1); if (latest) this.monitoring.set(latest); if (!["preparing", "running"].includes(value.state)) this.stop(value.id); }, error => this.activity.mutate(value => { value.error = error.message; })));
  }
  private stop(id: string) { this.subscriptions.get(id)?.(); this.subscriptions.delete(id); }
  private upsert(run: InferenceRun) {
    let created = false;
    this.runs.mutate(values => {
      const index = values.findIndex(value => value.id === run.id);
      if (index < 0) { values.unshift(run); created = true; }
      else values[index] = run;
    });
    this.runModel(run.id).set(run);
    this.publishObservability(run);
    if (created) this.runIds.mutate(values => { values.unshift(run.id); });
  }

  private publishObservability(run: InferenceRun) {
    const model = this.observabilityModels.get(run.id);
    if (!model) return;
    const current = Date.now();
    const terminal = !["preparing", "running"].includes(run.state);
    if (!terminal && current - (this.observabilityPublishedAt.get(run.id) ?? 0) < OBSERVABILITY_PUBLISH_INTERVAL_MS) return;
    model.set(observabilitySnapshot(run));
    this.observabilityPublishedAt.set(run.id, current);
  }
}

export const inference = new InferenceStore();
