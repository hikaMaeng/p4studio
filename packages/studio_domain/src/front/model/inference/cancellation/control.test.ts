import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { P4Event } from "@p4studio/p4-protocol";
import type { DeploymentRecord } from "../../../../common/protocol/deployments/index.js";
import type { InferenceRun } from "../../../../common/protocol/inference/index.js";
import { P4_CANCEL_CONTENT_TYPE, P4_INFERENCE_ERROR_CONTENT_TYPE, P4_RELEASE_RECEIPT_CONTENT_TYPE } from "../../../../common/protocol/inference/cancellation.js";
import { InferenceCancellation } from "./control.js";
import { InferenceExecutions } from "./executions.js";
import { emptyRequestTelemetry } from "../observability.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture(ids = ["one", "two"]) {
  const run: InferenceRun = { id: "run", modelId: "model", modelName: "Model", state: "running", submitted: ids.length, completed: 0, createdAt: "2026-10-05T00:00:00Z", error: null, nUbatch: 8, monitoring: [], monitoringSummary: null, telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: ids.map(id => ({ id, state: "queued", prompt: "prompt", text: "partial", receivedTokens: 1, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, waveIndex: 1, submittedAt: "", completedAt: null, error: null, telemetry: emptyRequestTelemetry() })) };
  const publish = vi.fn(), close = vi.fn();
  const control = new InferenceCancellation(run, 42, publish, 100);
  const submission = (id: string): P4Event => ({ eventId: `prefill-${id}`, correlationId: "operation", causationId: null, source: { kind: "outer", address: "head:52000", channel: "outer", generation: 7 }, target: { kind: "node", address: "head:52000", nodeId: "head", generation: 9 }, returnRoute: { kind: "outer", address: "head:52000", channel: "outer", generation: 7 }, class: 1, sequence: 1, deadline: null, adapterKind: "llamacpp", contentType: "prefill", payload: new Uint8Array() });
  ids.forEach(id => control.submitted(id, submission(id)));
  const dispatch = vi.fn(command => ({ ...submission(command.request_id), class: 0, contentType: P4_CANCEL_CONTENT_TYPE, eventId: `cancel-${command.request_id}` }));
  control.connect(dispatch, close);
  const reply = (id: string, contentType: string, payload: unknown): P4Event => { const original = submission(id); return { ...original, eventId: crypto.randomUUID(), source: original.target, target: original.source, causationId: original.eventId, class: contentType === P4_RELEASE_RECEIPT_CONTENT_TYPE ? 3 : 2, contentType, payload: new TextEncoder().encode(JSON.stringify(payload)) }; };
  const terminal = (id: string) => reply(id, P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_REQUEST_CANCELLED", detail: "native_kv_stop_proven=false", owner: { load_generation: 42, session_id: "run", request_id: id, incarnation: 3 } });
  const release = (id: string) => reply(id, P4_RELEASE_RECEIPT_CONTENT_TYPE, { load_generation: 42, session_id: "run", members: [{ request_id: id, submission_event_id: `prefill-${id}`, sequence_id: ids.indexOf(id), incarnation: 3, operation_id: 10 }] });
  const output = (id: string) => ({ load_generation: 42, session_id: "run", request_id: id, submission_event_id: `prefill-${id}`, incarnation: 3, sequence_id: ids.indexOf(id), token: 1, text: "token", position: 0, stop: null, output_ordinal: 0, release_operation_id: null });
  return { run, control, dispatch, close, reply, terminal, release, output };
}

it("sends one control CANCEL per unfinished exact submission, preserves completed requests, and is idempotent", async () => {
  const f = fixture(); f.run.requests[1]!.state = "completed"; f.run.completed = 1;
  const done = f.control.cancel(); expect(f.control.cancel()).toBe(done);
  expect(f.run.state).toBe("cancelling"); expect(f.control.requested).toBe(true);
  expect(f.dispatch).toHaveBeenCalledTimes(1);
  expect(f.dispatch.mock.calls[0]![0]).toMatchObject({ load_generation: 42, session_id: "run", request_id: "one", submission_event_id: "prefill-one" });
  f.control.consume(f.terminal("one")); expect(f.run.state).toBe("cancelling");
  f.control.consume(f.release("one")); await vi.advanceTimersByTimeAsync(25); await done;
  expect(f.run.state).toBe("cancelled"); expect(f.run.requests.map(value => value.state)).toEqual(["cancelled", "completed"]);
  expect(f.run.requests[0]!.text).toBe("partial"); expect(f.close).toHaveBeenCalledTimes(1);
});
it("accepts RELEASE before terminal and an earlier approved OUTPUT prefix after terminal", async () => {
  const f = fixture(["one"]); const done = f.control.cancel();
  f.control.consume(f.release("one")); f.control.consume(f.terminal("one"));
  f.control.output(f.output("one"), 1); await vi.advanceTimersByTimeAsync(25); expect(f.run.state).toBe("cancelling");
  f.control.output(f.output("one"), 0); await vi.advanceTimersByTimeAsync(25); await done; expect(f.run.state).toBe("cancelled");
});
it("keeps cancellation unknown when RELEASE never arrives, even after a cancellation terminal", async () => {
  const f = fixture(["one"]); const done = f.control.cancel(); f.control.consume(f.terminal("one"));
  await vi.advanceTimersByTimeAsync(100); await done; expect(f.run.state).toBe("unknown"); expect(f.run.requests[0]!.state).toBe("unknown");
});
it("rejects RELEASE whose operation differs from a natural terminal received before the receipt", async () => {
  const f = fixture(["one"]);
  f.control.output({ ...f.output("one"), stop: "length", release_operation_id: 99 }, 0);
  expect(() => f.control.consume(f.release("one"))).toThrow("RELEASE operation changed");
});
it("accepts a queued PREFILL cancellation refusal without inventing admitted RELEASE", async () => {
  const f = fixture(["one"]); const done = f.control.cancel();
  f.control.consume(f.reply("one", P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_ADAPTER_EVENT_REJECTED", detail: "PREFILL cancelled before admission;cancel_event=cancel-one", submission: { load_generation: 42, session_id: "run", request_id: "one", submission_event_id: "prefill-one" } }));
  await vi.advanceTimersByTimeAsync(25); await done; expect(f.run.state).toBe("cancelled");
});
it.each(["source", "target", "correlation", "cause", "load", "session", "incarnation"])("rejects a cancellation terminal with wrong %s", async field => {
  const f = fixture(["one"]); f.control.output(f.output("one"), 0); const done = f.control.cancel(); const event = f.terminal("one");
  const payload = JSON.parse(new TextDecoder().decode(event.payload));
  if (field === "source") event.source = { ...event.source, generation: 99 } as P4Event["source"];
  if (field === "target") event.target = { ...event.target, generation: 99 } as P4Event["target"];
  if (field === "correlation") event.correlationId = "other";
  if (field === "cause") event.causationId = "old-submission";
  if (field === "load") payload.owner.load_generation = 99;
  if (field === "session") payload.owner.session_id = "other";
  if (field === "incarnation") payload.owner.incarnation = 99;
  event.payload = new TextEncoder().encode(JSON.stringify(payload));
  expect(() => f.control.consume(event)).toThrow(); await vi.advanceTimersByTimeAsync(100); await done; expect(f.run.state).toBe("unknown");
});
it("does not use a CANCEL diagnostic as a request terminal, and preserves a winning natural completion", async () => {
  const f = fixture(["one"]); const done = f.control.cancel();
  const event = f.reply("one", P4_INFERENCE_ERROR_CONTENT_TYPE, { code: "LLAMA_ADAPTER_EVENT_REJECTED", detail: "cancel names no request this head currently holds", command: { state: "rejected", input_content_type: P4_CANCEL_CONTENT_TYPE, first_error: "no request" } }); event.causationId = "cancel-one";
  f.control.consume(event); expect(f.run.requests[0]!.state).toBe("queued");
  f.run.requests[0]!.state = "completed"; f.run.completed = 1; f.control.consume(f.release("one")); await vi.advanceTimersByTimeAsync(25); await done;
  expect(f.run.requests[0]!.state).toBe("completed"); expect(f.run.completed).toBe(1);
});
it("blocks new inference during UNLOAD and waits for all matching runs before the operation", async () => {
  const f = fixture(["one"]), registry = new InferenceExecutions();
  const model = { id: "model", stages: [{ agentId: "agent", nodeId: "head" }] } as DeploymentRecord;
  registry.register(model, f.control); const operation = vi.fn(async () => "unloaded"); const pending = registry.unload(model, operation);
  expect(operation).not.toHaveBeenCalled();
  expect(() => registry.register(model, fixture([]).control)).toThrow("being unloaded");
  f.control.consume(f.terminal("one")); f.control.consume(f.release("one")); await vi.advanceTimersByTimeAsync(25);
  expect(await pending).toBe("unloaded"); expect(operation).toHaveBeenCalledTimes(1);
  registry.register(model, fixture([]).control);
});
it("stops a run using a shared node under another model ID, leaves unrelated runs alone, and unloads on unknown stop", async () => {
  const f = fixture(["one"]), other = fixture(["two"]); other.run.id = "other";
  const registry = new InferenceExecutions();
  const model = { id: "model", stages: [{ agentId: "agent", nodeId: "head" }] } as DeploymentRecord;
  registry.register(model, f.control); registry.register({ ...model, id: "unrelated", stages: [{ ...model.stages[0]!, nodeId: "other" }] }, other.control);
  const operation = vi.fn(async () => "unloaded"); const pending = registry.unload({ ...model, id: "alias" }, operation);
  await vi.advanceTimersByTimeAsync(100); await pending;
  expect(f.run.state).toBe("unknown"); expect(other.control.requested).toBe(false); expect(operation).toHaveBeenCalledTimes(1);
});
it("waits for an already pending SESSION proof write before UNLOAD records its newer revision", async () => {
  const f = fixture([]), registry = new InferenceExecutions();
  f.run.state = "preparing";
  let finishWrite!: () => void;
  f.control.preparationWrite = new Promise<void>(resolve => { finishWrite = resolve; });
  const model = { id: "model", stages: [{ agentId: "agent", nodeId: "head" }] } as DeploymentRecord;
  registry.register(model, f.control);
  const operation = vi.fn(async () => "unloaded");
  const pending = registry.unload(model, operation);
  await vi.advanceTimersByTimeAsync(25);
  expect(f.run.state).toBe("cancelled"); expect(operation).not.toHaveBeenCalled();
  finishWrite(); await pending;
  expect(operation).toHaveBeenCalledTimes(1);
});
