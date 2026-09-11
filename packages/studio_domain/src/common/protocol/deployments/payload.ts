import type { DeploymentInput, PlacementStage } from "./index.js";

// Same quoting rule as the native startup-plan tokenizer: backslashes are literal.
export function planTokens(text: string): string[] {
  const tokens: string[] = []; let token = "", quoted = false;
  if (text.includes("\0")) throw new Error("Plan contains NUL");
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (/\s/.test(char) && !quoted) { if (token) tokens.push(token); token = ""; }
    else token += char;
  }
  if (quoted) throw new Error("Plan has an unclosed quote");
  if (token) tokens.push(token);
  return tokens;
}
export function llamaPlanSummary(text: string) {
  const tokens = planTokens(text);
  const get = (...names: string[]) => {
    const values = tokens.flatMap((v, i) => names.includes(v) ? [tokens[i + 1] ?? ""] : names.some(n => v.startsWith(`${n}=`)) ? [v.slice(v.indexOf("=") + 1)] : []);
    if (values.length > 1) throw new Error(`Plan repeats ${names[0]}`);
    return values[0];
  };
  const number = (name: string) => {
    const raw = get(name), value = Number(raw);
    if (raw === undefined || !/^\d+$/.test(raw) || !Number.isSafeInteger(value)) throw new Error(`Plan requires ${name}`);
    return value;
  };
  const artifact = get("--model", "-m");
  if (!artifact) throw new Error("Plan requires --model");
  return { artifact, layerStart: number("--layer-begin"), layerEnd: number("--layer-end"), device: get("--device", "-dev") ?? "" };
}
export function readLlamaPayload(stage: PlacementStage, generation: number): Record<string, unknown> {
  const options: unknown = JSON.parse(stage.loadOptionsJson ?? "{}");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("LOAD options must be a JSON object");
  if ("plan" in options || "load_generation" in options) throw new Error("Edit plan separately; load_generation is assigned when loading");
  const payload: Record<string, unknown> = { ...options, plan: stage.planText, load_generation: generation };
  for (const key of ["binary", "endpoint"]) if (typeof payload[key] !== "string" || !String(payload[key]).trim()) throw new Error(`LOAD requires ${key}`);
  for (const key of ["n_batch", "n_ubatch", "context_size", "total_context_size", "sequence_capacity"]) {
    if (!Number.isSafeInteger(payload[key]) || Number(payload[key]) <= 0) throw new Error(`LOAD requires a positive ${key}`);
  }
  for (const key of ["ready_timeout_ms", "io_timeout_ms"]) {
    if (payload[key] !== undefined && (!Number.isSafeInteger(payload[key]) || Number(payload[key]) <= 0)) throw new Error(`Invalid ${key}`);
  }
  if (Number(payload.n_ubatch) > Number(payload.n_batch) || Number(payload.total_context_size) < Number(payload.context_size) * Number(payload.sequence_capacity)) throw new Error("Invalid LOAD batch/context capacity");
  if (payload.args !== undefined && (!Array.isArray(payload.args) || payload.args.some(v => typeof v !== "string"))) throw new Error("args must be a string array");
  if (payload.environment !== undefined && (!Array.isArray(payload.environment) || payload.environment.some(v => !Array.isArray(v) || v.length !== 2 || v.some(s => typeof s !== "string")))) throw new Error("environment must contain [name, value] pairs");
  return payload;
}

/** Migrate legacy form data once. Thereafter text is the sole LOAD argument source. */
export function editAsText(input: DeploymentInput, stage: PlacementStage): void {
  if (input.adapter !== "llamacpp" || stage.planText !== undefined) return;
  const { plan, load_generation: _generation, ...options } = buildLoadPayload(input, stage, 1);
  stage.planText = String(plan); stage.loadOptionsJson = JSON.stringify(options, null, 2);
}

export const LLAMA_TYPES = {
  loadContentType: "application/vnd.p4.llamacpp.load-v3+json",
  loadedContentType: "application/vnd.p4.llamacpp.loaded-v3+json",
  unloadContentType: "application/vnd.p4.llamacpp.unload-v3+json",
  unloadedContentType: "application/vnd.p4.llamacpp.unloaded-v3+json",
  errorContentType: "application/vnd.p4.llamacpp.error-v2+json",
};
// The native plan tokenizer preserves backslashes; JSON/shell escaping is incorrect here.
export function quotePlan(value: string): string {
  if (/["\r\n\0]/.test(value)) throw new Error("Plan values cannot contain quotes, newlines or NUL");
  return `"${value}"`;
}
export function buildLoadPayload(plan: DeploymentInput, stage: PlacementStage, generation: number): Record<string, unknown> {
  if (plan.adapter !== "llamacpp") {
    const payload: unknown = JSON.parse(stage.customPayload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Adapter payload must be a JSON object");
    return { ...payload, load_generation: generation };
  }
  if (stage.planText !== undefined) return readLlamaPayload(stage, generation);
  const args: unknown = JSON.parse(stage.argsJson), environment: unknown = JSON.parse(stage.environmentJson);
  if (!Array.isArray(args) || args.some(v => typeof v !== "string")) throw new Error("Runtime arguments must be a JSON string array");
  if (!Array.isArray(environment) || environment.some(v => !Array.isArray(v) || v.length !== 2 || v.some(s => typeof s !== "string"))) throw new Error("Environment must be an array of [name, value] pairs");
  // Owned fields cannot be silently replaced by free-form native options.
  const optionTokens: string[] = []; let token = "", quoted = false;
  for (const char of stage.options) {
    if (char === '"') quoted = !quoted;
    else if (/\s/.test(char) && !quoted) { if (token) optionTokens.push(token); token = ""; }
    else token += char;
  }
  if (quoted || stage.options.includes("\0")) throw new Error("Malformed additional plan options");
  if (token) optionTokens.push(token);
  const reserved = new Set(["--model", "-m", "--layer-begin", "--layer-end", "--kv-layer-begin", "--kv-layer-end", "--n-seq-max", "--batch-size", "-b", "--ubatch-size", "-ub", "--ctx-size", "-c", "--device", "-dev"]);
  if (optionTokens.some(v => reserved.has(v.split("=")[0]!))) throw new Error("Additional options override a placement field");
  if (args.length) throw new Error("Use additional plan options; runtime arguments cannot override Studio placement");
  const tokens = ["--model", quotePlan(stage.artifact), "--layer-begin", stage.layerStart, "--layer-end", stage.layerEnd,
    "--kv-layer-begin", stage.layerStart, "--kv-layer-end", stage.layerEnd, "--n-seq-max", plan.sequenceCapacity,
    "--batch-size", plan.nBatch, "--ubatch-size", plan.nUbatch, "--ctx-size", plan.contextSize * plan.sequenceCapacity];
  if (stage.device) tokens.push("--device", quotePlan(stage.device));
  return { load_generation: generation, binary: stage.binary, endpoint: stage.endpoint,
    plan: `${tokens.join(" ")} ${stage.options}`.trim(), args, environment,
    n_batch: plan.nBatch, n_ubatch: plan.nUbatch, context_size: plan.contextSize,
    total_context_size: plan.contextSize * plan.sequenceCapacity, sequence_capacity: plan.sequenceCapacity,
    ready_timeout_ms: plan.timeoutMs, io_timeout_ms: plan.timeoutMs };
}
