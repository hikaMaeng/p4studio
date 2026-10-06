import { SliceModel } from "../SliceModel.js";
import type { RecoveryOperation } from "../../../common/protocol/recovery/index.js";
export interface RecoveryGateway {
  list(agentId: string): Promise<{ configured: boolean; operations: RecoveryOperation[] }>;
  plan(agentId: string): Promise<RecoveryOperation>;
  execute(operation: RecoveryOperation): Promise<unknown>;
  verify(operation: RecoveryOperation): Promise<unknown>;
  resume(operation: RecoveryOperation): Promise<unknown>;
  reprobe(operation: RecoveryOperation): Promise<unknown>;
  cancel(operation: RecoveryOperation): Promise<unknown>;
  reviewRetry(operation: RecoveryOperation): Promise<unknown>;
  retry(operation: RecoveryOperation): Promise<unknown>;
}
let gateway: RecoveryGateway | undefined;
export function startRecovery(next: RecoveryGateway) { gateway = next; }
class RecoveryModel {
  readonly data = new SliceModel<{ configured: boolean; operations: RecoveryOperation[] }>({ configured: false, operations: [] });
  readonly activity = new SliceModel({ busy: false, error: "" });
  private generation = 0;
  constructor(readonly agentId: string) {}
  async refresh() { if (!gateway) throw new Error("Recovery gateway unavailable"); this.data.set(await gateway.list(this.agentId)); }
  private async action<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (this.activity.value.busy) return; this.activity.set({ busy: true, error: "" });
    try { return await work(); } catch (error) { this.activity.mutate(value => { value.error = String(error); }); }
    finally { this.activity.mutate(value => { value.busy = false; }); }
  }
  plan() { return this.action(async () => { const operation = await gateway!.plan(this.agentId); await this.refresh(); return operation; }); }
  execute(operation: RecoveryOperation) { return this.action(async () => { await gateway!.execute(operation); await this.refresh(); }); }
  verify(operation: RecoveryOperation) { return this.action(async () => { await gateway!.verify(operation); await this.refresh(); }); }
  resume(operation: RecoveryOperation) { return this.action(async () => { await gateway!.resume(operation); await this.refresh(); }); }
  reprobe(operation: RecoveryOperation) { return this.action(async () => { await gateway!.reprobe(operation); await this.refresh(); }); }
  cancel(operation: RecoveryOperation) { return this.action(async () => { await gateway!.cancel(operation); await this.refresh(); }); }
  reviewRetry(operation: RecoveryOperation) { return this.action(async () => { await gateway!.reviewRetry(operation); await this.refresh(); }); }
  retry(operation: RecoveryOperation) { return this.action(async () => { await gateway!.retry(operation); await this.refresh(); }); }
  watch() {
    const generation = ++this.generation; const tick = async () => { try { await this.refresh(); } catch (error) { this.activity.mutate(value => { value.error = String(error); }); } if (generation === this.generation) setTimeout(() => void tick(), 2000); };
    void tick(); return () => { if (generation === this.generation) this.generation++; };
  }
}
const models = new Map<string, RecoveryModel>();
export function recoveryFor(id: string) { let model = models.get(id); if (!model) { model = new RecoveryModel(id); models.set(id, model); } return model; }
