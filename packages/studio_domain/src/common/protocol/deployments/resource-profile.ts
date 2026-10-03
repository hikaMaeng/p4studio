import type { PlacementStage } from "./index.js";

// P4 authority: layers/adapters/llamacpp/staged/adapter/src/v2/resource_profile.rs.
export const LLAMA_RESOURCE_PROFILE_VERSION = 2;

// ResourceProfile is deny_unknown_fields and every field is required and positive.
const FIELDS = [
  "max_requests", "max_request_retained_bytes", "max_input_tokens", "max_request_bytes", "max_output_tokens_per_request",
  "max_output_tokens", "max_physical_result_bytes", "max_completion_payload_bytes", "max_completion_retained_bytes",
  "max_edge_retained_bytes", "max_receipt_retained_bytes", "max_output_token_bytes", "max_output_terminal_bytes",
  "max_release_receipt_bytes", "outer_token_issue_window",
] as const;
export type LlamaResourceProfile = { version: number } & Record<(typeof FIELDS)[number], number>;

/**
 * The profile checks P4 `validate_preload` makes that need no agent state.
 * Store headroom, the minimum completion entry and READY agreement stay with
 * the adapter; passing here is not acceptance of the LOAD.
 */
export function readLlamaResourceProfile(value: unknown): LlamaResourceProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LOAD requires a resource_profile object");
  const input = value as Record<string, unknown>;
  if (input.version !== LLAMA_RESOURCE_PROFILE_VERSION) {
    throw new Error(`resource_profile version ${String(input.version)} is unsupported; the current P4 adapter requires version ${LLAMA_RESOURCE_PROFILE_VERSION}`);
  }
  const unknown = Object.keys(input).filter(key => key !== "version" && !(FIELDS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`resource_profile has unknown fields: ${unknown.join(", ")}`);
  const profile = { version: LLAMA_RESOURCE_PROFILE_VERSION } as LlamaResourceProfile;
  for (const key of FIELDS) {
    const field = input[key];
    if (!Number.isSafeInteger(field) || Number(field) <= 0) throw new Error(`resource_profile requires a positive ${key}`);
    profile[key] = Number(field);
  }
  if (profile.max_request_bytes > profile.max_request_retained_bytes) throw new Error("resource_profile: one request exceeds the aggregate request byte limit");
  if (profile.max_requests * profile.max_output_tokens_per_request > profile.max_output_tokens) throw new Error("resource_profile: aggregate output token limit cannot cover every request");
  if (profile.max_physical_result_bytes > profile.max_completion_payload_bytes
    || profile.max_completion_payload_bytes > profile.max_completion_retained_bytes
    || profile.max_completion_payload_bytes > profile.max_edge_retained_bytes) {
    throw new Error("resource_profile: physical result, completion and edge byte limits are inconsistent");
  }
  for (const key of ["max_output_token_bytes", "max_output_terminal_bytes", "max_release_receipt_bytes"] as const) {
    if (profile[key] > profile.max_completion_payload_bytes) throw new Error(`resource_profile: ${key} exceeds the per-completion payload ceiling`);
  }
  return profile;
}

export function stageResourceProfile(stage: PlacementStage): LlamaResourceProfile {
  const options: unknown = JSON.parse(stage.loadOptionsJson ?? "{}");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("LOAD options must be a JSON object");
  return readLlamaResourceProfile((options as Record<string, unknown>).resource_profile);
}

// Per reserved item, above its declared footprint: the completion entry
// overhead and the group's backing array. Both are Rust-internal sizes Studio
// cannot read, so this is a deliberate overestimate of each.
const RESERVATION_SLACK_BYTES = 4096;

/**
 * A completion-store byte capacity (LOAD `retained_bytes`) that is not below
 * P4 `minimum_completion_store_bytes`: the ordinary completion budget, plus the
 * terminal and release receipt each resident request is guaranteed, the shared
 * output-token window, and one compute and one control progress group.
 * It is an upper estimate, not the exact Rust value.
 */
export function llamaCompletionStoreBytes(profile: LlamaResourceProfile): number {
  const perRequest = profile.max_output_terminal_bytes + profile.max_release_receipt_bytes + 2 * RESERVATION_SLACK_BYTES;
  const perToken = profile.max_output_token_bytes + RESERVATION_SLACK_BYTES;
  const bytes = 3 * profile.max_completion_retained_bytes + profile.max_requests * perRequest + profile.outer_token_issue_window * perToken;
  if (!Number.isSafeInteger(bytes)) throw new Error("resource_profile completion store capacity overflows");
  return bytes;
}

/** Simultaneous completion entries P4 checks at LOAD: 2N guarantees, the token window, and the two progress groups. */
export function llamaCompletionStoreCount(profile: LlamaResourceProfile): number {
  return 2 * profile.max_requests + profile.outer_token_issue_window + (2 * profile.max_requests + 1) + 1;
}
