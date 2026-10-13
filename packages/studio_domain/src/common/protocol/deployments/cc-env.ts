

// P4 staged CC knobs, read from the stage LOAD environment at LOAD time and
// effective only in CC mode. P4 aligns the whole pipeline on one value (the
// tail decides the width, but every stage carries the same environment).
// see F:/dev/p4 docs/speculative-staged.md "CC 3단계" and "폭 고정 W".
export const STAGED_CONFIRMED_COMMIT_ENV = "P4_STAGED_CONFIRMED_COMMIT";
export const STAGED_CC_FIXED_WIDTH_ENV = "P4_STAGED_CC_FIXED_WIDTH";

export type StageCcEnv = { confirmedCommit: string | null; fixedWidth: string | null };

export type CcEnvSource = { loadOptionsJson?: string | undefined; environmentJson?: string | undefined };

/** Declared CC/W environment of one stage. Reads loadOptionsJson first and
 * falls back to the legacy environmentJson form; malformed JSON is refused. */
export function stageCcEnv(stage: CcEnvSource): StageCcEnv {
  const raw = stage.loadOptionsJson ?? stage.environmentJson ?? "[]";
  let options: unknown;
  try { options = JSON.parse(raw); }
  catch { throw new Error("LOAD environment must be a JSON object or [name, value] pairs"); }
  const pairs: unknown = options && typeof options === "object" && !Array.isArray(options)
    ? (options as Record<string, unknown>).environment
    : options;
  if (pairs === undefined) return { confirmedCommit: null, fixedWidth: null };
  if (!Array.isArray(pairs) || pairs.some(v => !Array.isArray(v) || v.length !== 2 || v.some(s => typeof s !== "string"))) throw new Error("LOAD environment must contain [name, value] pairs");
  const get = (name: string): string | null => (pairs as [string, string][]).find(([key]) => key === name)?.[1] ?? null;
  return { confirmedCommit: get(STAGED_CONFIRMED_COMMIT_ENV), fixedWidth: get(STAGED_CC_FIXED_WIDTH_ENV) };
}

/** Every stage must declare the same CC/W environment. An unset knob is a
 * value too: mixing set and unset stages is refused, since P4 reads the knob
 * per stage at LOAD and the pipeline must be aligned. */
export function checkCcEnvironmentAgreement(stages: (CcEnvSource & { nodeId: string })[]): void {
  const envs = stages.map(stage => ({ nodeId: stage.nodeId, ...stageCcEnv(stage) }));
  const first = envs[0];
  if (!first) return;
  for (const env of envs) {
    if (env.confirmedCommit !== first.confirmedCommit) throw new Error(`Stage CC environments disagree: ${STAGED_CONFIRMED_COMMIT_ENV} is ${first.confirmedCommit ?? "unset"} on node ${first.nodeId} but ${env.confirmedCommit ?? "unset"} on node ${env.nodeId}`);
    if (env.fixedWidth !== first.fixedWidth) throw new Error(`Stage CC environments disagree: ${STAGED_CC_FIXED_WIDTH_ENV} is ${first.fixedWidth ?? "unset"} on node ${first.nodeId} but ${env.fixedWidth ?? "unset"} on node ${env.nodeId}`);
  }
}

export type SpeculativeContract = { mode: "none" | "deferred" | "checkpoint" | "cc"; maxDraft: number; maxPhysicalRows: number; maxNewOutputs: number };

/** Parses a LOAD-reported speculative contract
 * (`mode/max_draft/max_physical_rows/max_new_outputs`, built by the P4
 * adapter from HELLO). Returns null for anything else; callers display the
 * raw string as unconfirmed instead of deriving a mode from it. */
export function parseSpeculativeContract(value: unknown): SpeculativeContract | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  if (parts.length !== 4) return null;
  const [mode, draft, rows, outputs] = parts as [string, string, string, string];
  if (!["none", "deferred", "checkpoint", "cc"].includes(mode)) return null;
  const numbers = [draft, rows, outputs].map(Number);
  if (numbers.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
  return { mode: mode as SpeculativeContract["mode"], maxDraft: numbers[0]!, maxPhysicalRows: numbers[1]!, maxNewOutputs: numbers[2]! };
}

export type StageCcEvidence = {
  /** Declared CC/W setting from the stage LOAD environment. */
  declared: StageCcEnv;
  /** Actual contract the current LOAD generation reported, if any. */
  reportedContract: string | null;
  /** Actual created context capacity the current LOAD generation reported, if any. */
  reportedCapacity: number | null;
  /** W application evidence. P4 LOAD reports carry no W field, so this is
   * always "none": setting P4_STAGED_CC_FIXED_WIDTH=1 alone never proves W
   * applied. Evidence lives only in harness stderr
   * (`P4_STAGED_CC_FIXED_WIDTH width=<W> tail=<0|1>`) cited by presets. */
  widthEvidence: "none";
};

/** Execution evidence for one stage, split into declared setting, LOAD-reported
 * actual contract/capacity, and W evidence state. Stale or ambiguous reports
 * yield null actuals (unconfirmed), never derived values. */
export function summarizeStageCcEvidence(
  record: {
    stages: (CcEnvSource & { id: string; nodeId: string })[];
    reports: { stageId: string; telemetry: unknown }[];
    loadGeneration: number;
  },
  stageId: string,
): StageCcEvidence | null {
  const stage = record.stages.find(value => value.id === stageId);
  if (!stage) return null;
  const declared = stageCcEnv(stage);
  const empty = { declared, reportedContract: null, reportedCapacity: null, widthEvidence: "none" } as const;
  const reports = record.reports.filter(report => report.stageId === stageId);
  if (reports.length !== 1) return { ...empty };
  const body = reports[0]!.telemetry;
  if (!body || typeof body !== "object" || Array.isArray(body) || !("load_generation" in body) || body.load_generation !== record.loadGeneration) return { ...empty };
  const reported = body as Record<string, unknown>;
  return {
    declared,
    reportedContract: typeof reported.speculative_contract === "string" && reported.speculative_contract.length ? reported.speculative_contract : null,
    reportedCapacity: Number.isSafeInteger(reported.created_context_capacity) && Number(reported.created_context_capacity) >= 0 ? Number(reported.created_context_capacity) : null,
    widthEvidence: "none",
  };
}
