import { expect, it } from "vitest";
import { llamaSessionContract, LLAMA_SESSION_V4, LLAMA_SESSION_V5, SESSION_CONTRACT_ERRORS } from "./session.js";
import type { DeploymentRecord } from "./index.js";
const model = (contracts: unknown[]) => ({ loadGeneration: 42, stages: contracts.map((_, index) => ({ id: String(index), agentId: "agent", nodeId: String(index), nodeGeneration: 1,
  artifact: "model.gguf", layerStart: index, layerEnd: index + 1, binary: "binary", endpoint: "", device: "", options: "", argsJson: "[]", environmentJson: "[]", customPayload: "{}" })),
  reports: contracts.map((contract, index) => ({ stageId: String(index), state: "loaded" as const, detail: "", failureDetail: "", loadRequested: true, updatedAt: "", telemetry: contract === undefined ? {} : { load_generation: 42, speculative_contract: contract } })) });
it("전체 필드 부재는 네 필드 SESSION v4를 유지한다", () => {
  expect(llamaSessionContract(model([undefined, undefined]))).toEqual({ contentType: LLAMA_SESSION_V4, fields: {} });
});
it("모든 LOAD 계약이 완전히 같은 경우 v5에 원문을 전달한다", () => {
  expect(llamaSessionContract(model(["cc/2/5/3", "cc/2/5/3"]))).toEqual({ contentType: LLAMA_SESSION_V5, fields: { stage_contracts: ["cc/2/5/3", "cc/2/5/3"] } });
});
it.each([
  { contracts: ["cc/2/5/3", "checkpoint/2/3/3"], code: SESSION_CONTRACT_ERRORS.mismatch },
  { contracts: ["cc/2/5/3", undefined], code: SESSION_CONTRACT_ERRORS.partial },
  { contracts: [null, null], code: SESSION_CONTRACT_ERRORS.invalid },
  { contracts: ["", ""], code: SESSION_CONTRACT_ERRORS.invalid },
  { contracts: ["bad\0contract", "bad\0contract"], code: SESSION_CONTRACT_ERRORS.invalid },
])("사전 거부는 번역 문자열 대신 정확한 오류 코드를 반환한다: $code", ({ contracts, code }) => {
  expect(() => llamaSessionContract(model(contracts))).toThrow(new Error(code));
});
it("오래된 LOAD 세대와 중복·누락 보고를 거부한다", () => {
  const value: Pick<DeploymentRecord, "stages" | "reports" | "loadGeneration"> = model(["none/0/0/0", "none/0/0/0"]);
  value.reports[0]!.telemetry = { load_generation: 41, speculative_contract: "none/0/0/0" };
  expect(() => llamaSessionContract(value)).toThrow(new Error(SESSION_CONTRACT_ERRORS.generation));
  value.reports[0]!.telemetry = { speculative_contract: "none/0/0/0" };
  expect(() => llamaSessionContract(value)).toThrow(new Error(SESSION_CONTRACT_ERRORS.generation));
  value.reports = [value.reports[1]!]; expect(() => llamaSessionContract(value)).toThrow(new Error(SESSION_CONTRACT_ERRORS.reports));
  value.reports.push(value.reports[0]!); expect(() => llamaSessionContract(value)).toThrow(new Error(SESSION_CONTRACT_ERRORS.reports));
});
it("stage 수 부족도 오류 코드로 거부한다", () => {
  expect(() => llamaSessionContract(model([undefined]))).toThrow(new Error(SESSION_CONTRACT_ERRORS.stages));
});
