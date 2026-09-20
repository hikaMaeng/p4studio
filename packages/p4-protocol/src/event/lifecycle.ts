// See docs/api.md#node-lifecycle; mirrors P4 event/lifecycle.rs, not adapter JSON.
export const NODE_LOAD_CONTENT_TYPE = "application/vnd.p4.node.load-v1";
export const NODE_UNLOAD_CONTENT_TYPE = "application/vnd.p4.node.unload-v1";
export const NODE_LIFECYCLE_RESULT_CONTENT_TYPE = "application/vnd.p4.node.lifecycle-result-v1";
export const MAX_LIFECYCLE_METADATA_BYTES = 65536;
export type LifecycleOperation = "load" | "unload";
export type LifecycleResourceState = "absent" | "present" | "unknown";
export interface LifecycleRequestMetadata {
  schema: 1; node_id: string; node_generation: number; adapter_kind: string; adapter_content_type: string;
  queue_capacity?: number; completion_capacity?: number; retained_capacity?: number; retained_bytes?: number;
}
export interface LifecycleResultMetadata {
  schema: 1; node_id: string; node_generation: number; adapter_kind: string; adapter_content_type: string;
  operation: LifecycleOperation; status: "succeeded" | "rejected" | "failed"; resource_state: LifecycleResourceState;
  first_error?: string | null; cleanup_error?: string | null;
}
const identityKeys = ["schema", "node_id", "node_generation", "adapter_kind", "adapter_content_type"];
const capacityKeys = ["queue_capacity", "completion_capacity", "retained_capacity", "retained_bytes"] as const;
function identity(value: unknown, extra: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid lifecycle metadata");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => ![...identityKeys, ...extra].includes(key))) throw new Error("Unknown lifecycle metadata field");
  if (item.schema !== 1 || !Number.isSafeInteger(item.node_generation) || Number(item.node_generation) <= 0
    || ["node_id", "adapter_kind", "adapter_content_type"].some(key => typeof item[key] !== "string" || !item[key])) throw new Error("Invalid lifecycle schema or identity");
  return item;
}
export function parseLifecycleRequest(value: unknown, operation: LifecycleOperation): LifecycleRequestMetadata {
  const item = identity(value, [...capacityKeys]);
  if (capacityKeys.some(key => operation === "load" ? !Number.isSafeInteger(item[key]) || Number(item[key]) <= 0 : item[key] != null)) throw new Error("Invalid lifecycle allocation capacities");
  return item as unknown as LifecycleRequestMetadata;
}
export function parseLifecycleResult(value: unknown): LifecycleResultMetadata {
  const item = identity(value, ["operation", "status", "resource_state", "first_error", "cleanup_error"]);
  if (!["load", "unload"].includes(String(item.operation)) || !["succeeded", "rejected", "failed"].includes(String(item.status))
    || !["absent", "present", "unknown"].includes(String(item.resource_state))) throw new Error("Invalid lifecycle outcome");
  if (["first_error", "cleanup_error"].some(key => item[key] != null && typeof item[key] !== "string")) throw new Error("Invalid lifecycle error");
  if (item.status === "succeeded" ? item.first_error != null || item.cleanup_error != null : typeof item.first_error !== "string" || !item.first_error) throw new Error("Inconsistent lifecycle errors");
  return item as unknown as LifecycleResultMetadata;
}
export function encodeLifecycleMetadata(metadata: LifecycleRequestMetadata | LifecycleResultMetadata, opaque: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  if (json.length > MAX_LIFECYCLE_METADATA_BYTES) throw new Error("Lifecycle metadata too large");
  const payload = new Uint8Array(4 + json.length + opaque.length);
  new DataView(payload.buffer).setUint32(0, json.length, true); payload.set(json, 4); payload.set(opaque, 4 + json.length);
  return payload;
}
export function decodeLifecycleMetadata(payload: Uint8Array): { metadata: unknown; opaque: Uint8Array } {
  if (payload.length < 4) throw new Error("Incomplete lifecycle prefix");
  const size = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, true);
  if (size > MAX_LIFECYCLE_METADATA_BYTES || size > payload.length - 4) throw new Error("Invalid lifecycle metadata length");
  return { metadata: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload.subarray(4, 4 + size))), opaque: payload.subarray(4 + size) };
}
