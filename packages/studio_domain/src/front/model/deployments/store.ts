import { SliceModel } from "../SliceModel.js";
import type { DeploymentInput, DeploymentRecord, PlacementStage } from "../../../common/protocol/deployments/index.js";
import { buildLoadPayload, editAsText, llamaPlanSummary } from "../../../common/protocol/deployments/payload.js";
import type { DeploymentPreset } from "../../../common/protocol/deployments/presets.js";

export interface DeploymentGateway {
  list(): Promise<DeploymentRecord[]>;
  save(input: DeploymentInput, id?: string): Promise<DeploymentRecord>;
  remove(id: string, discard: boolean): Promise<void>;
  operate(id: string, action: "load" | "unload"): Promise<DeploymentRecord>;
  reconcile(id: string): Promise<DeploymentRecord>;
}
export type ObservedNodeTarget = { agentId: string; nodeId: string; nodeGeneration: number; adapterKind: string };
export function emptyDeployment(): DeploymentInput {
  return { name: "", adapter: "llamacpp", ingressAgentId: "", totalLayers: 1, contextSize: 4096, sequenceCapacity: 1, nBatch: 512, nUbatch: 128, timeoutMs: 600000,
    loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "", stages: [] };
}
export function emptyStage(): PlacementStage {
  return { id: crypto.randomUUID(), agentId: "", nodeId: "", nodeGeneration: 1, artifact: "", layerStart: 0, layerEnd: 1, binary: "", endpoint: "", device: "", options: "--kv-unified", argsJson: "[]", environmentJson: "[]", customPayload: "{}" };
}
class DeploymentStore {
  readonly records = new SliceModel<DeploymentRecord[]>([]);
  readonly editor = new SliceModel<{ open: boolean; id?: string; input: DeploymentInput }>({ open: false, input: emptyDeployment() });
  readonly activity = new SliceModel({ busy: false, error: "" });
  readonly inspection = new SliceModel({ modelId: "" });
  readonly selection = new SliceModel("");
  readonly nodeSelection = new SliceModel<ObservedNodeTarget | null>(null);
  readonly agentPositions = new SliceModel(new Map<string, { x: number; y: number }>());
  readonly libraryOpen = new SliceModel(true);
  private gateway?: DeploymentGateway;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshing = false;
  start(gateway: DeploymentGateway) { if (this.gateway) return; this.gateway = gateway; void this.refresh(); }
  async refresh() {
    if (!this.gateway || this.refreshing) return; this.refreshing = true;
    if (this.timer) clearTimeout(this.timer);
    const version = this.records.getVersion();
    try { const records = await this.gateway.list(); if (this.records.getVersion() === version) this.records.set(records); }
    catch (e) { this.activity.mutate(v => { v.error = String(e); }); }
    finally { this.refreshing = false; this.timer = setTimeout(() => void this.refresh(), 2000); }
  }
  open(record?: DeploymentRecord) {
    const input = record ? structuredClone(record) : emptyDeployment();
    try { for (const stage of input.stages) editAsText(input, stage); }
    catch (e) { this.activity.mutate(v => { v.error = String(e); }); return; }
    this.editor.set({ open: true, id: record?.id, input }); this.selection.set(""); this.nodeSelection.set(null);
    this.libraryOpen.set(!record);
    this.activity.mutate(v => { v.error = ""; });
  }
  applyPreset(preset: DeploymentPreset, agents: { id: string; host: string; port: number }[]) {
    const find = (address: string) => agents.find(a => `tcp://${a.host.includes(":") ? `[${a.host}]` : a.host}:${a.port}` === address)?.id ?? "";
    const input = emptyDeployment(), suffix = crypto.randomUUID().slice(0, 8);
    Object.assign(input, { name: preset.name, presetId: preset.id, adapter: preset.adapter,
      ingressAgentId: find(preset.ingressAddress), totalLayers: preset.totalLayers, timeoutMs: preset.timeoutMs,
      pipelineCompatibility: preset.source.pipelineCompatibility ?? "exact-build" });
    input.stages = preset.stages.map((stage, index) => {
      const options = JSON.parse(stage.loadOptionsJson);
      return { ...emptyStage(), ...stage, id: crypto.randomUUID(), agentId: find(stage.referenceAgent),
        nodeId: `${preset.id}-${suffix}-${index}`, binary: options.binary, endpoint: options.endpoint };
    });
    this.editor.mutate(v => { v.input = input; }); this.selection.set(input.stages[0]?.id ?? "");
    this.libraryOpen.set(false);
  }
  addStage(agentId: string) {
    const stage = emptyStage(), input = this.editor.value.input;
    stage.agentId = agentId; stage.nodeId = `node-${crypto.randomUUID().slice(0, 8)}`;
    stage.layerStart = input.stages.at(-1)?.layerEnd ?? 0; stage.layerEnd = Math.max(stage.layerStart + 1, input.totalLayers);
    editAsText(input, stage);
    this.editor.mutate(v => { v.input.stages.push(stage); }); this.selection.set(stage.id); this.nodeSelection.set(null);
  }
  selectObservedNode(node: ObservedNodeTarget) {
    this.nodeSelection.set(node);
    const stage = this.editor.value.input.stages.find(value => value.agentId === node.agentId && value.nodeId === node.nodeId && value.nodeGeneration === node.nodeGeneration);
    this.selection.set(stage?.id ?? "");
  }
  connectPlannedStages(source: ObservedNodeTarget, target: ObservedNodeTarget) {
    const stages = this.editor.value.input.stages;
    const matches = (stage: PlacementStage, node: ObservedNodeTarget) => stage.agentId === node.agentId && stage.nodeId === node.nodeId && stage.nodeGeneration === node.nodeGeneration;
    const from = stages.find(stage => matches(stage, source)), to = stages.find(stage => matches(stage, target));
    if (!from || !to || from === to) return;
    this.editor.mutate(() => { stages.splice(stages.indexOf(to), 1); stages.splice(stages.indexOf(from) + 1, 0, to); });
    this.selection.set(to.id); this.nodeSelection.set(null);
  }
  updateStage<K extends keyof PlacementStage>(id: string, key: K, value: PlacementStage[K]) {
    this.editor.mutate(v => {
      const stage = v.input.stages.find(s => s.id === id)!; stage[key] = value;
      if (v.input.adapter === "llamacpp" && stage.planText !== undefined) {
        try { Object.assign(stage, llamaPlanSummary(stage.planText)); } catch { /* Incomplete text remains editable. */ }
        try { const options = JSON.parse(stage.loadOptionsJson ?? "{}"); stage.binary = options.binary ?? ""; stage.endpoint = options.endpoint ?? ""; } catch { /* Validated on save/load. */ }
      }
    });
  }
  removeStage(id: string) {
    this.editor.mutate(v => { v.input.stages = v.input.stages.filter(s => s.id !== id); });
    this.selection.set(this.editor.value.input.stages[0]?.id ?? "");
  }
  moveStage(id: string, direction: number) {
    this.editor.mutate(v => { const stages = v.input.stages, i = stages.findIndex(s => s.id === id), j = i + direction;
      if (j >= 0 && j < stages.length) [stages[i], stages[j]] = [stages[j]!, stages[i]!]; });
  }
  close() { this.editor.mutate(v => { v.open = false; }); }
  async save(): Promise<DeploymentRecord | null> {
    if (!this.gateway || this.activity.value.busy) return null;
    this.activity.mutate(v => { v.busy = true; v.error = ""; });
    try {
      const input = this.editor.value.input;
      for (const stage of input.stages) {
        if (input.adapter === "llamacpp" && stage.planText !== undefined) Object.assign(stage, llamaPlanSummary(stage.planText));
        buildLoadPayload(input, stage, 1);
      }
      const record = await this.gateway.save(input, this.editor.value.id); this.close(); await this.refresh(); return record;
    }
    catch (e) { this.activity.mutate(v => { v.error = e instanceof Error ? e.message : String(e); }); return null; }
    finally { this.activity.mutate(v => { v.busy = false; }); }
  }
  async remove(id: string, discard: boolean) {
    if (!this.gateway || this.activity.value.busy) return false;
    this.activity.mutate(v => { v.busy = true; v.error = ""; });
    try { await this.gateway.remove(id, discard); this.records.mutate(values => { const index = values.findIndex(value => value.id === id); if (index >= 0) values.splice(index, 1); }); return true; }
    catch (e) { this.activity.mutate(v => { v.error = e instanceof Error ? e.message : String(e); }); return false; }
    finally { this.activity.mutate(v => { v.busy = false; }); }
  }
  async operate(id: string, action: "load" | "unload") {
    if (!this.gateway || this.activity.value.busy) return;
    this.activity.mutate(v => { v.busy = true; v.error = ""; });
    try { const record = await this.gateway.operate(id, action); this.records.mutate(values => { const index = values.findIndex(v => v.id === id); if (index >= 0) values[index] = record; }); await this.refresh(); }
    catch (e) { this.activity.mutate(v => { v.error = e instanceof Error ? e.message : String(e); }); }
    finally { this.activity.mutate(v => { v.busy = false; }); }
  }
  async reconcile(id: string) {
    if (!this.gateway || this.activity.value.busy) return;
    this.activity.mutate(v => { v.busy = true; v.error = ""; });
    this.inspection.mutate(v => { v.modelId = id; });
    try {
      const record = await this.gateway.reconcile(id);
      this.records.mutate(values => { const index = values.findIndex(value => value.id === id); if (index >= 0) values[index] = record; });
    } catch (error) { this.activity.mutate(v => { v.error = error instanceof Error ? error.message : String(error); }); }
    finally { this.inspection.mutate(v => { v.modelId = ""; }); this.activity.mutate(v => { v.busy = false; }); }
  }
}
export const deployments = new DeploymentStore();
