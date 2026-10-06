import type { DeploymentRecord } from "../../../../common/protocol/deployments/index.js";
import type { InferenceCancellation } from "./control.js";
import { isActiveInference } from "./control.js";

const keysFor = (record: DeploymentRecord) => [`model:${record.id}:${record.loadGeneration}`, ...record.stages.map(stage => JSON.stringify([stage.agentId, stage.nodeId, stage.nodeGeneration, record.loadGeneration]))];

/** Browser-owned executions and unload barriers, shared by both UNLOAD UIs. */
export class InferenceExecutions {
  private readonly active = new Map<string, { keys: string[]; control: InferenceCancellation }>();
  private readonly unloading = new Set<string>();
  register(record: DeploymentRecord, control: InferenceCancellation) {
    const keys = keysFor(record);
    if (keys.some(key => this.unloading.has(key))) throw new Error("The model or one of its nodes is being unloaded");
    if ([...this.active.values()].some(value => value.keys.some(key => keys.includes(key)) && (isActiveInference(value.control.run) || !value.control.settled))) throw new Error("The previous inference still owns this model; stop or unload it before preparing another session");
    this.active.set(control.run.id, { keys, control });
    return () => this.active.delete(control.run.id);
  }
  cancel(runId: string) { return this.active.get(runId)?.control.cancel() ?? Promise.resolve(); }
  async unload<T>(record: DeploymentRecord, operation: () => Promise<T>): Promise<T> {
    const keys = keysFor(record);
    if (keys.some(key => this.unloading.has(key))) throw new Error("An unload is already active for this model or node");
    keys.forEach(key => this.unloading.add(key));
    try {
      const controls = [...this.active.values()].filter(value => value.keys.some(key => keys.includes(key))).map(value => value.control);
      await Promise.all(controls.map(control => control.cancel()));
      // A SESSION proof already sent to storage must finish before UNLOAD records its newer revision.
      await Promise.allSettled(controls.map(control => control.preparationWrite));
      // Unknown cancellation is preserved; authoritative UNLOAD may still reclaim the node.
      return await operation();
    } finally { keys.forEach(key => this.unloading.delete(key)); }
  }
}
export const inferenceExecutions = new InferenceExecutions();
