import { expect, it } from "vitest";
import { decodeLifecycleMetadata, encodeLifecycleMetadata, parseLifecycleRequest, parseLifecycleResult } from "./lifecycle.js";

// Literal fixture consumed by P4 lifecycle.rs::node_load_lifecycle_codec_accepts_python_canonical_fixture.
const json = '{"adapter_content_type":"application/vnd.p4.hf.command-v2","adapter_kind":"hf-transformers","completion_capacity":1,"node_generation":7,"node_id":"n0","queue_capacity":1,"retained_bytes":4096,"retained_capacity":2,"schema":1}';
const opaque = new TextEncoder().encode("python-opaque");
it("matches the Rust-consumed Python canonical fixture byte for byte", () => {
  const metadata = parseLifecycleRequest(JSON.parse(json), "load");
  const bytes = encodeLifecycleMetadata(metadata, opaque);
  expect(bytes.slice(0, 4)).toEqual(new Uint8Array([225, 0, 0, 0]));
  expect(new TextDecoder().decode(bytes.subarray(4))).toBe(json + "python-opaque");
  expect(decodeLifecycleMetadata(bytes)).toEqual({ metadata, opaque });
});
it.each([new Uint8Array(3), new Uint8Array([9, 0, 0, 0, 123, 125]), new Uint8Array([1, 0, 1, 0])])("rejects truncated and oversized metadata", bytes => {
  expect(() => decodeLifecycleMetadata(bytes)).toThrow();
});
it.each([{ schema: 2 }, { node_generation: 0 }, { node_generation: 9007199254740992 }, { extra: true }, { retained_bytes: 0 }, { retained_capacity: undefined }])("rejects invalid identities and allocation before sending: %j", change => {
  expect(() => parseLifecycleRequest({ ...JSON.parse(json), ...change }, "load")).toThrow();
});
it("rejects allocation on UNLOAD, invalid UTF-8 and preserves opaque binary", () => {
  expect(() => parseLifecycleRequest(JSON.parse(json), "unload")).toThrow();
  expect(() => decodeLifecycleMetadata(new Uint8Array([1, 0, 0, 0, 255]))).toThrow();
  const metadata = parseLifecycleRequest(JSON.parse(json), "load"), binary = new Uint8Array([0, 255, 0, 128]);
  expect(decodeLifecycleMetadata(encodeLifecycleMetadata(metadata, binary)).opaque).toEqual(binary);
});
it("rejects success carrying cleanup error and unexplained failure", () => {
  const base = { schema: 1, node_id: "n", node_generation: 1, adapter_kind: "test", adapter_content_type: "result", operation: "load", status: "succeeded", resource_state: "present" };
  expect(() => parseLifecycleResult({ ...base, cleanup_error: "child survived" })).toThrow();
  expect(() => parseLifecycleResult({ ...base, status: "failed" })).toThrow();
});
