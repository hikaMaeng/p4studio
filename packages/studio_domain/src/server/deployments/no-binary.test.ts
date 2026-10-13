import { expect, it } from "vitest";
import { deploymentInputSchema } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, editAsText } from "../../common/protocol/deployments/payload.js";
import { deploymentPresets } from "../../common/protocol/deployments/presets.js";
import { validateDeployment } from "../../common/protocol/deployments/runtime.js";
import { deployments, emptyDeployment, emptyStage } from "../../front/model/deployments/store.js";

it("LOAD의 구형 폼과 JSON 경로 모두 binary를 보내지 않는다", () => {
  const input = emptyDeployment(), stage = { ...emptyStage(), agentId: "a", nodeId: "n", artifact: "S:\\models\\model.gguf", endpoint: "127.0.0.1:53001", options: "", binary: "C:\\old\\server.exe" };
  input.stages.push(stage);
  const legacy = buildLoadPayload(input, stage, 23);
  expect(legacy).not.toHaveProperty("binary");
  expect(() => validateDeployment(input)).not.toThrow();
  editAsText(input, stage);
  expect(stage).not.toHaveProperty("binary");
  expect(buildLoadPayload(input, stage, 23)).toEqual(legacy);
  for (const binary of ["C:\\stale\\server.exe", "", null, 42]) {
    stage.loadOptionsJson = JSON.stringify({ ...JSON.parse(stage.loadOptionsJson!), binary, future_option: [1, 2] });
    const payload = buildLoadPayload(input, stage, 24);
    expect(payload).not.toHaveProperty("binary");
    expect(payload).toMatchObject({ load_generation: 24, future_option: [1, 2] });
    expect(() => validateDeployment(input)).not.toThrow();
  }
});

it("옛 JSON·폼 선언은 읽기·편집·재저장 후 다른 옵션과 모델 경로를 보존한다", () => {
  const input = { ...emptyDeployment(), name: "옛 선언" }, source = deploymentPresets[0]!.stages[0]!;
  const oldStage = { ...emptyStage(), ...source, nodeId: "old-node", binary: "old.exe", loadOptionsJson: JSON.stringify({ ...JSON.parse(source.loadOptionsJson), binary: "old.exe", future_option: { a: true } }) };
  input.stages = [oldStage];
  const read = deploymentInputSchema.parse(input);
  expect(read.stages[0]).not.toHaveProperty("binary");
  expect(JSON.parse(read.stages[0]!.loadOptionsJson!)).not.toHaveProperty("binary");
  editAsText(input, input.stages[0]!);
  expect(input.stages[0]).not.toHaveProperty("binary");
  expect(input.stages[0]!.artifact).toBe(source.artifact);
  const payload = buildLoadPayload(read, read.stages[0]!, 9);
  expect(payload.future_option).toEqual({ a: true });
  expect(payload).not.toHaveProperty("binary");
  deployments.open(); deployments.applyPreset(deploymentPresets[0]!, []);
  const stage = deployments.editor.value.input.stages[0]!;
  deployments.updateStage(stage.id, "loadOptionsJson", JSON.stringify({ ...JSON.parse(stage.loadOptionsJson!), binary: "ignored.exe" }));
  const saved = deploymentInputSchema.parse(deployments.editor.value.input);
  expect(JSON.parse(saved.stages[0]!.loadOptionsJson!)).not.toHaveProperty("binary");
  deployments.updateStage(stage.id, "loadOptionsJson", "{");
  expect(deploymentInputSchema.parse(deployments.editor.value.input).stages[0]!.loadOptionsJson).toBe("{");
  expect(() => buildLoadPayload(deployments.editor.value.input, stage, 9)).toThrow();
});

it("모든 프리셋의 LOAD 옵션에 binary가 없다", () => {
  for (const preset of deploymentPresets) for (const stage of preset.stages) expect(JSON.parse(stage.loadOptionsJson)).not.toHaveProperty("binary");
});
