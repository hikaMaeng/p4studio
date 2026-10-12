import type { DeploymentRecord } from "./index.js";

export const LLAMA_SESSION_V4 = "application/vnd.p4.llamacpp.session-v4+json";
export const LLAMA_SESSION_V5 = "application/vnd.p4.llamacpp.session-v5+json";

// 화면은 resource key로 번역한다. activity/history에는 언어와 무관한 코드만 보존한다.
export const SESSION_CONTRACT_ERRORS = {
  stages: "SESSION_STAGES_REQUIRED",
  reports: "SESSION_LOAD_REPORT_INVALID",
  generation: "SESSION_LOAD_GENERATION_MISMATCH",
  invalid: "SESSION_SPECULATIVE_CONTRACT_INVALID",
  partial: "SESSION_SPECULATIVE_CONTRACT_MISSING",
  mismatch: "SESSION_SPECULATIVE_CONTRACT_MISMATCH",
} as const;

/** LOAD 보고만 권위로 사용한다. 계획에서 계약을 재생성하지 않는다.
 * see docs/api.md#session-contract. CC commands.rs의 문자열을 바이트 그대로 전달한다. */
export function llamaSessionContract(model: Pick<DeploymentRecord, "stages" | "reports" | "loadGeneration">): { contentType: string; fields: { stage_contracts?: string[] } } {
  if (model.stages.length < 2) throw new Error(SESSION_CONTRACT_ERRORS.stages);
  const contracts = model.stages.map(stage => {
    const reports = model.reports.filter(report => report.stageId === stage.id);
    if (reports.length !== 1) throw new Error(SESSION_CONTRACT_ERRORS.reports);
    const report = reports[0]!, body = report.telemetry;
    if (!body || typeof body !== "object" || Array.isArray(body) || !("speculative_contract" in body)) return undefined;
    if (!("load_generation" in body) || body.load_generation !== model.loadGeneration) throw new Error(SESSION_CONTRACT_ERRORS.generation);
    if (typeof body.speculative_contract !== "string" || !body.speculative_contract.length || body.speculative_contract.includes("\0")) throw new Error(SESSION_CONTRACT_ERRORS.invalid);
    return body.speculative_contract;
  });
  if (contracts.every(value => value === undefined)) return { contentType: LLAMA_SESSION_V4, fields: {} };
  if (contracts.some(value => value === undefined)) throw new Error(SESSION_CONTRACT_ERRORS.partial);
  if (contracts.some(value => value !== contracts[0])) throw new Error(SESSION_CONTRACT_ERRORS.mismatch);
  // CC f2854c71 §8.19: route 순서의 목록이다. 과거 스칼라 v5와 content type은 같지만 본문은 호환되지 않는다.
  return { contentType: LLAMA_SESSION_V5, fields: { stage_contracts: contracts.map(value => value!) } };
}
