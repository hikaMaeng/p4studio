import { z } from "zod";

// P4 v2/{commands,completion}.rs; adapter contracts stay outside p4-protocol.
export const P4_CANCEL_CONTENT_TYPE = "application/vnd.p4.llamacpp.cancel-v1+json";
export const P4_INFERENCE_ERROR_CONTENT_TYPE = "application/vnd.p4.llamacpp.error-v2+json";
export const P4_RELEASE_RECEIPT_CONTENT_TYPE = "application/vnd.p4.llamacpp.release-receipt-v1+json";
export const P4_SCOPE_CLOSE_CONTENT_TYPE = "application/vnd.p4.llamacpp.scope-close-v1+json";
export const P4_SCOPE_CLOSED_CONTENT_TYPE = "application/vnd.p4.llamacpp.scope-closed-v1+json";
const id = z.string().min(1).max(4096).refine(value => !value.includes("\0"));
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = uint.min(1);
export const p4CancelCommandSchema = z.object({
  load_generation: positive, session_id: id, request_id: id, submission_event_id: id,
  reason: z.string().refine(value => !value.includes("\0") && new TextEncoder().encode(value).length <= 256).nullable().optional(),
}).strict().refine(value => new TextEncoder().encode(`${value.session_id}\0${value.request_id}`).length <= 4096);
export type P4CancelCommand = z.infer<typeof p4CancelCommandSchema>;
export const p4ScopeCloseCommandSchema = z.object({
  load_generation: positive,
  reason: z.string().refine(value => !value.includes("\0") && new TextEncoder().encode(value).length <= 256).optional(),
}).strict();
export type P4ScopeCloseCommand = z.infer<typeof p4ScopeCloseCommandSchema>;
export const p4ScopeClosedSchema = z.object({
  load_generation: positive,
  status: z.enum(["closing", "closed"]),
  selected: uint.optional(),
  native_kv_stop_proven: z.boolean(),
}).strict();
export type P4ScopeClosed = z.infer<typeof p4ScopeClosedSchema>;
export const p4InferenceErrorSchema = z.union([
  z.object({ code: id, detail: z.string(), owner: z.object({ load_generation: positive, session_id: id, request_id: id, incarnation: positive }).strict() }).strict(),
  z.object({ code: id, detail: z.string(), submission: z.object({ load_generation: positive, session_id: id, request_id: id, submission_event_id: id }).strict() }).strict(),
  z.object({ code: id, detail: z.string(), command: z.object({ state: z.literal("rejected"), input_content_type: id, first_error: z.string() }).strict() }).strict(),
]);
export const p4ReleaseReceiptSchema = z.object({
  load_generation: positive, session_id: id,
  members: z.array(z.object({ request_id: id, submission_event_id: id, sequence_id: uint.max(0xffff_ffff), incarnation: positive, operation_id: positive }).strict()).min(1),
}).strict().refine(value => new Set(value.members.map(member => member.request_id)).size === value.members.length
  && new Set(value.members.map(member => member.sequence_id)).size === value.members.length);
