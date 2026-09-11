import { expect, it } from "vitest";
import { deploymentPresets } from "../../common/protocol/deployments/presets.js";
import { deploymentInputSchema } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, editAsText } from "../../common/protocol/deployments/payload.js";
import { deployments, emptyDeployment, emptyStage } from "../../front/model/deployments/store.js";
import { validatePlacement } from "./plan.js";
import { checkBuilds } from "./compatibility.js";

it("imports the six HY3 and sixteen Step placements with original per-node options", () => {
  for (const preset of deploymentPresets) {
    deployments.open(); deployments.applyPreset(preset, []);
    const input = deploymentInputSchema.parse(deployments.editor.value.input);
    expect(input.stages).toHaveLength(preset.id.startsWith("hy3") ? 6 : 16);
    expect(() => validatePlacement(input)).toThrow(/ingress/);
    input.ingressAgentId = "ingress";
    input.stages.forEach((s, i) => { s.agentId = s.referenceAgent!; const recorded = preset.stages[i]!;
      const payload = buildLoadPayload(input, s, 987);
      expect(payload).toEqual({ ...JSON.parse(recorded.loadOptionsJson), plan: recorded.planText, load_generation: 987 });
    });
    expect(() => validatePlacement(input)).not.toThrow();
  }
});
it("preserves multiline plans, regex escapes, native KV cuts and arbitrary load options through editing", () => {
  deployments.open(); deployments.applyPreset(deploymentPresets[0]!, []);
  const input = deployments.editor.value.input, stage = input.stages[0]!;
  const plan = stage.planText!.replace('--kv-layer-end 16', '--kv-layer-end 13').replace(' --memory-topology', '\n--memory-topology');
  deployments.updateStage(stage.id, "planText", plan);
  deployments.updateStage(stage.id, "loadOptionsJson", JSON.stringify({ ...JSON.parse(stage.loadOptionsJson!), args: ["--some-runtime-option", "value"], future_option: true }));
  const restored = deploymentInputSchema.parse(JSON.parse(JSON.stringify(input)));
  const payload = buildLoadPayload(restored, restored.stages[0]!, 44);
  expect(payload.plan).toBe(plan); expect(payload.args).toEqual(["--some-runtime-option", "value"]); expect(payload.future_option).toBe(true);
  expect(stage.layerEnd).toBe(16); expect(plan).toContain('\\.ffn_');
});
it("keeps malformed text editable but refuses sending it or trusting stale placement summaries", () => {
  deployments.open(); deployments.applyPreset(deploymentPresets[0]!, []);
  const input = deployments.editor.value.input; input.ingressAgentId = "entry";
  input.stages.forEach(s => { s.agentId = s.referenceAgent!; });
  input.stages[0]!.planText = input.stages[0]!.planText!.replace('--layer-end 16', '--layer-end 17');
  expect(() => validatePlacement(input)).toThrow(/summary/);
  input.stages[0]!.loadOptionsJson = '{';
  expect(() => validatePlacement(input)).toThrow();
});
it("migrates legacy inputs without replacing their Windows paths or load configuration", () => {
  const input = emptyDeployment(), stage = emptyStage();
  stage.artifact = 'S:\\models with spaces\\model.gguf'; stage.binary = 'C:\\runtime\\server.exe'; stage.endpoint = '127.0.0.1:53001';
  input.stages.push(stage); const before = buildLoadPayload(input, stage, 23); editAsText(input, stage);
  expect(buildLoadPayload(input, stage, 23)).toEqual(before);
});
it("creates an ordered placement edge from two observed P4 node ports", () => {
  deployments.open();
  deployments.connectObservedNodes(
    { agentId: "agent-a", nodeId: "node-a", nodeGeneration: 7, adapterKind: "example-adapter" },
    { agentId: "agent-b", nodeId: "node-b", nodeGeneration: 9, adapterKind: "example-adapter" },
  );
  expect(deployments.editor.value.input.stages).toMatchObject([
    { agentId: "agent-a", nodeId: "node-a", nodeGeneration: 7, createNode: false },
    { agentId: "agent-b", nodeId: "node-b", nodeGeneration: 9, createNode: false },
  ]);
  expect(deployments.editor.value.input.adapter).toBe("example-adapter");
});
it("allows heterogeneous backends only with explicit physical v4 and matching known ABI", () => {
  const wire = `p4pb4le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`;
  const first = { upstream_commit: "pin", patch_set: "patch", backend_inventory: "CUDA", stage_wire_abi: wire };
  const second = { ...first, backend_inventory: "Metal" };
  expect(() => checkBuilds([first, second])).toThrow(/backend_inventory/);
  expect(() => checkBuilds([first, second], "physical-wire-v4")).not.toThrow();
  expect(() => checkBuilds([first, { ...second, stage_wire_abi: "unknown" }], "physical-wire-v4")).toThrow(/ABI/);
  expect(() => checkBuilds([first, { ...second, patch_set: "different" }], "physical-wire-v4")).toThrow(/patch_set/);
});
