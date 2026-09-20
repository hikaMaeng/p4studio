import { SliceModel } from "../SliceModel.js";

export interface NodeUnloadTarget {
  agentId: string;
  nodeId: string;
  nodeGeneration: number;
  adapterKind: string;
}

export interface NodeUnloadGateway {
  unload(target: NodeUnloadTarget): Promise<void>;
}

export type NodeUnloadState = { busy: boolean; error: string | null; succeeded: boolean };

const key = (target: NodeUnloadTarget) => JSON.stringify([target.agentId, target.nodeId, target.nodeGeneration]);

/** Browser action state for a confirmed, single-node lifecycle operation. */
export class NodeUnloadStore {
  readonly states = new SliceModel(new Map<string, NodeUnloadState>());
  private gateway?: NodeUnloadGateway;

  start(gateway: NodeUnloadGateway) { if (!this.gateway) this.gateway = gateway; }
  state(target: NodeUnloadTarget) { return this.states.value.get(key(target)) ?? { busy: false, error: null, succeeded: false }; }
  async unload(target: NodeUnloadTarget) {
    if (!this.gateway || this.state(target).busy) return false;
    const targetKey = key(target);
    this.states.mutate(values => values.set(targetKey, { busy: true, error: null, succeeded: false }));
    try {
      await this.gateway.unload(target);
      this.states.mutate(values => values.set(targetKey, { busy: false, error: null, succeeded: true }));
      return true;
    } catch (error) {
      this.states.mutate(values => values.set(targetKey, { busy: false, error: error instanceof Error ? error.message : String(error), succeeded: false }));
      return false;
    }
  }
}

export const nodeUnload = new NodeUnloadStore();
