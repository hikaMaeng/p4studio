import { describe, expect, it } from "vitest";
import { llamaCompletionStoreBytes, llamaCompletionStoreCount, readLlamaResourceProfile } from "./resource-profile.js";
import { DEFAULT_NODE_ALLOCATION, nodeAllocation } from "./lifecycle.js";
import type { DeploymentRecord, PlacementStage } from "./index.js";

// The profile P4 tools/event-drive lifecycle.rs uses to show that the retired
// fixed 256 MiB store is too small (`expected_bytes > 256 * 1024 * 1024`).
const profile = {
  version: 2, max_requests: 8, max_request_retained_bytes: 67_108_864, max_input_tokens: 32_768, max_request_bytes: 1_048_576,
  max_output_tokens_per_request: 1_536, max_output_tokens: 12_288, max_physical_result_bytes: 271_615_628,
  max_completion_payload_bytes: 280_004_236, max_completion_retained_bytes: 288_392_844, max_edge_retained_bytes: 288_392_844,
  max_receipt_retained_bytes: 33_554_432, max_output_token_bytes: 4_096, max_output_terminal_bytes: 8_192,
  max_release_receipt_bytes: 8_192, outer_token_issue_window: 8,
};

describe("llama.cpp resource_profile v2", () => {
  it("accepts the current profile shape", () => {
    expect(readLlamaResourceProfile(profile)).toEqual(profile);
  });

  it("refuses a version 1 profile, a missing v2 field and an unknown field before LOAD", () => {
    expect(() => readLlamaResourceProfile({ ...profile, version: 1 })).toThrow("version 1 is unsupported");
    const { outer_token_issue_window: _window, ...withoutWindow } = profile;
    expect(() => readLlamaResourceProfile(withoutWindow)).toThrow("outer_token_issue_window");
    expect(() => readLlamaResourceProfile({ ...profile, future_field: 1 })).toThrow("unknown fields");
    expect(() => readLlamaResourceProfile(undefined)).toThrow("resource_profile object");
  });

  it("refuses the inconsistencies the adapter refuses without agent state", () => {
    expect(() => readLlamaResourceProfile({ ...profile, max_request_bytes: profile.max_request_retained_bytes + 1 })).toThrow("aggregate request byte");
    expect(() => readLlamaResourceProfile({ ...profile, max_output_tokens: 12_287 })).toThrow("output token");
    expect(() => readLlamaResourceProfile({ ...profile, max_physical_result_bytes: profile.max_completion_payload_bytes + 1 })).toThrow("inconsistent");
    expect(() => readLlamaResourceProfile({ ...profile, max_output_terminal_bytes: profile.max_completion_payload_bytes + 1 })).toThrow("payload ceiling");
    expect(() => readLlamaResourceProfile({ ...profile, outer_token_issue_window: 0 })).toThrow("positive");
  });

  it("sizes the completion store above the ordinary budget plus both progress groups", () => {
    const bytes = llamaCompletionStoreBytes(readLlamaResourceProfile(profile));
    expect(bytes).toBeGreaterThan(256 * 1024 * 1024);
    expect(bytes).toBeGreaterThan(3 * profile.max_completion_retained_bytes);
    expect(llamaCompletionStoreCount(readLlamaResourceProfile(profile))).toBe(2 * 8 + 8 + 17 + 1);
  });

  it("raises only an unspecified llama.cpp allocation and sends an explicit one as written", () => {
    const stage = { planText: "--model m", loadOptionsJson: JSON.stringify({ resource_profile: profile }) } as PlacementStage;
    const record = { adapter: "llamacpp" } as DeploymentRecord;
    expect(nodeAllocation(record, stage).retainedBytes).toBe(llamaCompletionStoreBytes(readLlamaResourceProfile(profile)));
    expect(nodeAllocation(record, stage).queueCapacity).toBe(DEFAULT_NODE_ALLOCATION.queueCapacity);
    const explicit = { queueCapacity: 1, completionCapacity: 2, retainedCapacity: 3, retainedBytes: 4 };
    expect(nodeAllocation(record, { ...stage, allocation: explicit })).toBe(explicit);
    expect(nodeAllocation({ adapter: "hf-transformers" } as DeploymentRecord, stage)).toBe(DEFAULT_NODE_ALLOCATION);
  });
});
