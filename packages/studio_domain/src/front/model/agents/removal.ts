import type { AgentRemovalResult } from "../../../common/protocol/graph-inventory/index.js";
import { SliceModel } from "../SliceModel.js";

// See apps/studio/docs/usage.md#agent-removal: removes Studio registration only.
export class AgentRemovalStore {
  readonly dialog = new SliceModel<{
    target: { id: string; name: string } | null;
    busy: boolean;
    error: "in_use" | "unknown" | null;
  }>({ target: null, busy: false, error: null });

  open(target: { id: string; name: string }) {
    if (!this.dialog.value.busy) this.dialog.set({ target: { id: target.id, name: target.name }, busy: false, error: null });
  }
  close() {
    if (!this.dialog.value.busy) this.dialog.set({ target: null, busy: false, error: null });
  }
  async confirm(remove: (id: string) => Promise<AgentRemovalResult>): Promise<string | undefined> {
    const { target, busy } = this.dialog.value;
    if (!target || busy) return;
    this.dialog.mutate(value => { value.busy = true; value.error = null; });
    try {
      const result = await remove(target.id);
      if (result === "in_use") {
        this.dialog.mutate(value => { value.error = "in_use"; });
        return;
      }
      this.dialog.set({ target: null, busy: false, error: null });
      return target.id;
    } catch {
      this.dialog.mutate(value => { value.error = "unknown"; });
    } finally {
      this.dialog.mutate(value => { value.busy = false; });
    }
  }
}
export const agentRemoval = new AgentRemovalStore();
