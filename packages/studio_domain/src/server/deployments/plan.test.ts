import { expect, it } from "vitest";
import type { DeploymentInput, PlacementStage } from "../../common/protocol/deployments/index.js";
import { buildLoadPayload, quotePlan, validatePlacement } from "./plan.js";
const stage: PlacementStage = { id: "s", agentId: "a", nodeId: "node", nodeGeneration: 1, createNode: true, artifact: "S:\\large models\\a.gguf", binary: "stage", endpoint: "127.0.0.1:50001", device: "", layerStart: 0, layerEnd: 1, options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}" };
const plan = (): DeploymentInput => ({ name: "test", adapter: "llamacpp", ingressAgentId: "a", totalLayers: 1, contextSize: 4096, sequenceCapacity: 1, nBatch: 512, nUbatch: 128, timeoutMs: 600000, loadContentType: "", loadedContentType: "", unloadContentType: "", unloadedContentType: "", errorContentType: "", stages: [{ ...stage }] });
it("quotes Windows paths without doubling native backslashes", () => {
  const p = plan(); expect(buildLoadPayload(p, p.stages[0]!, 8).plan).toContain('--model "S:\\large models\\a.gguf"');
  expect(() => quotePlan('bad"path')).toThrow();
});
it("rejects duplicate node identity and missing layer coverage", () => {
  const p = plan(); p.totalLayers = 2; p.stages.push({ ...p.stages[0]!, id: "other", layerStart: 1, layerEnd: 2 });
  expect(() => validatePlacement(p)).toThrow(/two placements/); p.stages.pop(); expect(() => validatePlacement(p)).toThrow(/cover all/);
});
it("rejects hidden overrides of the displayed layer window", () => {
  const p = plan(); p.stages[0]!.options = "--layer-begin 10"; expect(() => validatePlacement(p)).toThrow(/override/);
});
it("passes a non-llama adapter JSON payload without adding llama fields", () => {
  const p = plan(); p.adapter = "custom"; p.stages[0]!.customPayload = '{"model_ref":"remote://weights","partition":[0,1]}';
  expect(buildLoadPayload(p, p.stages[0]!, 42)).toEqual({ model_ref: "remote://weights", partition: [0, 1], load_generation: 42 });
});
