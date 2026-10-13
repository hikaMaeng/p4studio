import { expect, it } from "vitest";
import { checkCcEnvironmentAgreement, parseSpeculativeContract, stageCcEnv, summarizeStageCcEvidence } from "./cc-env.js";

const stage = (environment: [string, string][] | undefined, loadOptionsJson = true) => ({
  nodeId: "n0",
  ...(loadOptionsJson
    ? { loadOptionsJson: JSON.stringify({ endpoint: "127.0.0.1:1", environment }) }
    : { environmentJson: JSON.stringify(environment) }),
});
const pair = (name: string, value: string): [string, string] => [name, value];

it("LOAD environment에서 CC/W 선언 설정을 읽는다", () => {
  expect(stageCcEnv(stage(undefined))).toEqual({ confirmedCommit: null, fixedWidth: null });
  expect(stageCcEnv(stage([pair("P4_STAGED_CC_FIXED_WIDTH", "1")]))).toEqual({ confirmedCommit: null, fixedWidth: "1" });
  expect(stageCcEnv(stage([pair("P4_STAGED_CONFIRMED_COMMIT", "0")]))).toEqual({ confirmedCommit: "0", fixedWidth: null });
  expect(stageCcEnv(stage([pair("P4_STAGED_CC_FIXED_WIDTH", "1")], false))).toEqual({ confirmedCommit: null, fixedWidth: "1" });
  expect(() => stageCcEnv({ loadOptionsJson: "{", environmentJson: "[]" })).toThrow(/JSON/);
});

it("전 stage의 CC/W 환경 설정 일치를 검사한다", () => {
  const off = [stage(undefined), { ...stage(undefined), nodeId: "n1" }];
  expect(() => checkCcEnvironmentAgreement(off)).not.toThrow();
  const on = [stage([pair("P4_STAGED_CC_FIXED_WIDTH", "1")]), { ...stage([pair("P4_STAGED_CC_FIXED_WIDTH", "1")]), nodeId: "n1" }];
  expect(() => checkCcEnvironmentAgreement(on)).not.toThrow();
  expect(() => checkCcEnvironmentAgreement([stage([pair("P4_STAGED_CC_FIXED_WIDTH", "1")]), { ...stage(undefined), nodeId: "n1" }])).toThrow(/P4_STAGED_CC_FIXED_WIDTH/);
  expect(() => checkCcEnvironmentAgreement([stage([pair("P4_STAGED_CONFIRMED_COMMIT", "0")]), { ...stage([pair("P4_STAGED_CONFIRMED_COMMIT", "1")]), nodeId: "n1" }])).toThrow(/P4_STAGED_CONFIRMED_COMMIT/);
  expect(() => checkCcEnvironmentAgreement([])).not.toThrow();
});

it("LOAD 보고 계약 문자열을 도메인에서 파싱한다", () => {
  expect(parseSpeculativeContract("cc/2/5/3")).toEqual({ mode: "cc", maxDraft: 2, maxPhysicalRows: 5, maxNewOutputs: 3 });
  expect(parseSpeculativeContract("none/0/0/0")).toEqual({ mode: "none", maxDraft: 0, maxPhysicalRows: 0, maxNewOutputs: 0 });
  expect(parseSpeculativeContract("deferred/4/5/5")?.mode).toBe("deferred");
  expect(parseSpeculativeContract("checkpoint/1/2/2")?.mode).toBe("checkpoint");
  for (const bad of ["", "cc/2/5", "cc/2/5/3/extra", "fast/2/5/3", "cc/-1/5/3", "cc/2.5/5/3", "cc/a/5/3", null, undefined, 42]) expect(parseSpeculativeContract(bad)).toBeNull();
});

it("선언 설정·보고 계약·용량·W 증거 유무를 구분해 요약한다", () => {
  const record = {
    loadGeneration: 42,
    stages: [{ id: "s0", nodeId: "n0", loadOptionsJson: JSON.stringify({ environment: [pair("P4_STAGED_CC_FIXED_WIDTH", "1")] }), environmentJson: "[]" }],
    reports: [{ stageId: "s0", telemetry: { load_generation: 42, speculative_contract: "cc/2/5/3", created_context_capacity: 65536 } }],
  };
  expect(summarizeStageCcEvidence(record, "s0")).toEqual({
    declared: { confirmedCommit: null, fixedWidth: "1" },
    reportedContract: "cc/2/5/3",
    reportedCapacity: 65536,
    widthEvidence: "none",
  });
  // 설정값만으로 W 적용을 확정하지 않는다: 증거는 항상 없음이다.
  expect(summarizeStageCcEvidence(record, "missing")).toBeNull();
  const stale = { ...record, reports: [{ stageId: "s0", telemetry: { load_generation: 41, speculative_contract: "cc/2/5/3", created_context_capacity: 1 } }] };
  expect(summarizeStageCcEvidence(stale, "s0")).toMatchObject({ reportedContract: null, reportedCapacity: null, widthEvidence: "none" });
  const legacy = { ...record, reports: [{ stageId: "s0", telemetry: { load_generation: 42 } }] };
  expect(summarizeStageCcEvidence(legacy, "s0")).toMatchObject({ reportedContract: null, reportedCapacity: null, widthEvidence: "none" });
});
