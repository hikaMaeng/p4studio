import { expect, it } from "vitest";
import { deploymentPresets } from "../../common/protocol/deployments/presets.js";
import { deploymentInputSchema } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, editAsText, llamaSequenceLimit } from "../../common/protocol/deployments/payload.js";
import { deployments, emptyDeployment, emptyStage } from "../../front/model/deployments/store.js";
import { validatePlacement } from "./plan.js";
import { checkBuilds } from "./compatibility.js";

it("기존 HY3 6·Step 16 및 Qwen 2·MiMo 3 stage의 원본 인자를 보존한다", () => {
  for (const preset of deploymentPresets) {
    deployments.open(); deployments.applyPreset(preset, []);
    const input = deploymentInputSchema.parse(deployments.editor.value.input);
    expect(input.stages).toHaveLength(preset.id.startsWith("hy3") ? 6 : preset.id.startsWith("step") ? 16 : preset.id.startsWith("qwen38") ? 2 : 3);
    expect(() => validatePlacement(input)).toThrow(/registered agent/);
    input.ingressAgentId = "ingress";
    input.stages.forEach((s, i) => { s.agentId = s.referenceAgent!; const recorded = preset.stages[i]!;
      const payload = buildLoadPayload(input, s, 987);
      expect(payload).toEqual({ ...JSON.parse(recorded.loadOptionsJson), plan: recorded.planText, load_generation: 987 });
    });
    expect(() => validatePlacement(input)).not.toThrow();
  }
});

it("실측 preset 노트와 근거 SHA를 보존하고 최소 stage slot을 계획에서 읽는다", () => {
  for (const [id, slots] of [["qwen38-none-seq16", 16], ["qwen38-mtp-nmax2", 5], ["mimo-dflash-nmax4", 64]] as const) {
    const preset = deploymentPresets.find(value => value.id === id)!;
    expect(preset.source.passed).toBe(true); expect(preset.source.configSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preset.source.artifactSha256).toMatch(/^[a-f0-9]{64}$/); expect(preset.source.evidenceFiles!.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    deployments.open(); deployments.applyPreset(preset, []);
    const input = deploymentInputSchema.parse(deployments.editor.value.input);
    expect(input.insightNotes).toBe(preset.insightNotes); expect(input.insightNotes).toContain("출처");
    expect(llamaSequenceLimit(input)).toBe(slots);
  }
  const input = deployments.editor.value.input;
  input.stages[1]!.planText = input.stages[1]!.planText!.replace("--n-seq-max 64", "--n-seq-max=3");
  expect(llamaSequenceLimit(input)).toBe(3);
  input.stages[1]!.planText += " --n-seq-max 4"; expect(llamaSequenceLimit(input)).toBeNull();
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
  stage.artifact = 'S:\\models with spaces\\model.gguf'; stage.endpoint = '127.0.0.1:53001';
  input.stages.push(stage); const before = buildLoadPayload(input, stage, 23); editAsText(input, stage);
  expect(buildLoadPayload(input, stage, 23)).toEqual(before);
});
it("does not turn occupied observed nodes into planned LOAD targets", () => {
  deployments.open();
  const source = { agentId: "a", nodeId: "occupied-a", nodeGeneration: 7, adapterKind: "llamacpp" };
  const target = { agentId: "b", nodeId: "occupied-b", nodeGeneration: 9, adapterKind: "llamacpp" };
  deployments.connectPlannedStages(source, target);
  expect(deployments.editor.value.input.stages).toEqual([]);
  deployments.addStage("a"); deployments.addStage("b");
  expect(deployments.editor.value.input.stages.map(s => s.agentId)).toEqual(["a", "b"]);
  expect(deployments.editor.value.input.stages.every(s => !s.nodeId.startsWith("occupied"))).toBe(true);
});
it("allows heterogeneous backends only with explicit physical v4 and matching known ABI", () => {
  const wire = `p4pb6le64:${"a".repeat(64)}:types=0/1/4,1/1/2,2/32/18`;
  const first = { upstream_commit: "pin", patch_set: "patch", backend_inventory: "CUDA", stage_wire_abi: wire };
  const second = { ...first, backend_inventory: "Metal" };
  expect(() => checkBuilds([first, second])).toThrow(/backend_inventory/);
  expect(() => checkBuilds([first, second], "physical-wire-v4")).not.toThrow();
  expect(() => checkBuilds([
    { ...first, stage_wire_abi: first.stage_wire_abi.replace("aaaa", "bbbb") },
    { ...second, stage_wire_abi: second.stage_wire_abi.replace("aaaa", "bbbb") },
  ], "physical-wire-v4")).not.toThrow();
  expect(() => checkBuilds([
    first,
    { ...second, stage_wire_abi: second.stage_wire_abi.replace("p4pb6le64:", "p4pb5le64:") },
  ], "physical-wire-v4")).toThrow(/ABI/);
  expect(() => checkBuilds([
    { ...first, stage_wire_abi: first.stage_wire_abi.replace("p4pb6le64:", "p4pb4le64:") },
    { ...second, stage_wire_abi: second.stage_wire_abi.replace("p4pb6le64:", "p4pb4le64:") },
  ], "physical-wire-v4")).toThrow(/ABI/);
  expect(() => checkBuilds([first, { ...second, stage_wire_abi: "unknown" }], "physical-wire-v4")).toThrow(/ABI/);
  expect(() => checkBuilds([first, { ...second, patch_set: "different" }], "physical-wire-v4")).toThrow(/patch_set/);
});
