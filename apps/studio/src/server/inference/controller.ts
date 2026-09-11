import { agentDialAddress } from "../agent-socket/routes.js";
import { randomUUID } from "node:crypto";
import { connect, type Socket } from "node:net";
import { encodeP4Event, decodeP4Event, type P4Endpoint, type P4Event } from "@p4studio/p4-protocol";
import type { InferenceRequest, InferenceRun, InferenceRunInput } from "@p4studio/studio_domain/common";
import type { DeploymentRecord } from "@p4studio/studio_domain/common";
import type { InferenceBatch } from "@p4studio/studio_domain/common";

const SESSION = "application/vnd.p4.llamacpp.session-v4+json";
const SESSION_READY = "application/vnd.p4.llamacpp.session-ready-v4+json";
const PREFILL = "application/vnd.p4.llamacpp.prefill-v3+json";
const OUTPUT = "application/vnd.p4.llamacpp.output-v5+json";
const BATCH = "application/vnd.p4.llamacpp.batch-observation-v4+json";
const ERROR = "application/vnd.p4.llamacpp.error-v2+json";

type Listener = (run: InferenceRun) => void;
type RequestTiming = { submittedAtMs: number; firstOutputAtMs?: number; prefillRows: number };
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null; }
function integer(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function text(value: unknown): string | null { return typeof value === "string" ? value : null; }
function now() { return new Date().toISOString(); }
function rate(rows: number, elapsedMs: number) { return rows > 0 && elapsedMs > 0 ? rows * 1000 / elapsedMs : null; }
function addressParts(address: string) {
  const parsed = new URL(address);
  if (parsed.protocol !== "tcp:" || !parsed.hostname || !parsed.port) throw new Error(`Invalid P4 agent address: ${address}`);
  return { host: parsed.hostname.replace(/^\[|\]$/g, ""), port: Number(parsed.port) };
}

/** A deliberate server-owned P4 TCP session. It publishes only its approved run projection to HTTP clients. */
export class InferenceController {
  private readonly runs = new Map<string, InferenceRun>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly timings = new Map<string, Map<string, RequestTiming>>();
  private readonly expected = new Map<string, number>();
  private readonly latestBatches = new Map<string, Map<string, InferenceBatch>>();

  list() { return [...this.runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)); }
  get(id: string) { return this.runs.get(id); }
  batchFor(modelId: string, address: string, nodeId: string) { return this.latestBatches.get(modelId)?.get(`${address}\0${nodeId}`) ?? null; }
  subscribe(id: string, listener: Listener) {
    const set = this.listeners.get(id) ?? new Set<Listener>(); set.add(listener); this.listeners.set(id, set);
    const run = this.runs.get(id); if (run) listener(run);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(id); };
  }
  create(model: DeploymentRecord, input: InferenceRunInput) {
    if (model.status !== "ready" || model.adapter !== "llamacpp" || !model.loadGeneration || model.stages.length < 2) throw new Error("The selected llama.cpp distributed model is not ready for inference");
    const run: InferenceRun = { id: randomUUID(), modelId: model.id, modelName: model.name, state: "preparing", submitted: 0, completed: 0, createdAt: now(), error: null, monitoring: [], requests: [] };
    this.runs.set(run.id, run); this.timings.set(run.id, new Map()); this.expected.set(run.id, input.concurrency * input.repetitions); this.publish(run);
    void this.execute(run, model, input);
    return run;
  }
  private publish(run: InferenceRun) { this.listeners.get(run.id)?.forEach(listener => listener(structuredClone(run))); }
  private fail(run: InferenceRun, detail: string) {
    run.error ??= detail; run.state = run.requests.some(request => request.state === "streaming") ? "unknown" : "failed";
    for (const request of run.requests) if (["queued", "streaming"].includes(request.state)) { request.state = "unknown"; request.error = detail; }
    this.publish(run);
  }
  private async execute(run: InferenceRun, model: DeploymentRecord, input: InferenceRunInput) {
    try {
      const ingressAddress = model.resolvedAddresses[model.ingressAgentId];
      if (!ingressAddress) throw new Error("The loaded model has no recorded ingress endpoint");
      const socket = await this.open(ingressAddress);
      const outer = { kind: "outer" as const, address: ingressAddress, channel: `studio-inference-${run.id}`, generation: Date.now() };
      let sequence = 1;
      const event = (target: P4Endpoint, contentType: string, payload: unknown, correlationId: string): P4Event => ({
        eventId: `${run.id}:${sequence}`, correlationId, causationId: null, source: outer, target, returnRoute: outer,
        class: contentType === PREFILL ? 1 : 0, sequence: sequence++, deadline: null, adapterKind: "llamacpp", contentType,
        payload: new TextEncoder().encode(JSON.stringify(payload)),
      });
      const stages = model.stages.map(stage => {
        const agent = model.resolvedAddresses[stage.agentId]; if (!agent) throw new Error(`No recorded endpoint for stage ${stage.id}`);
        return { agent, node: stage.nodeId, generation: stage.nodeGeneration };
      });
      const pendingSession = new Set<string>();
      for (const [index, stage] of stages.entries()) {
        const sent = event({ kind: "node", address: stage.agent, nodeId: stage.node, generation: stage.generation }, SESSION,
          { load_generation: model.loadGeneration, session_id: run.id, stages, stage_index: index }, "session");
        pendingSession.add(sent.eventId); await this.write(socket, sent);
      }
      await this.read(socket, (incoming) => {
        if (incoming.contentType === SESSION_READY && incoming.causationId && pendingSession.delete(incoming.causationId)) return pendingSession.size === 0;
        if (incoming.contentType === ERROR) throw new Error(this.errorDetail(incoming));
        return false;
      }, model.timeoutMs);
      run.state = "running"; this.publish(run);
      this.connectRun(socket, run);
      socket.on("error", error => this.fail(run, error.message));
      socket.on("close", () => { if (["preparing", "running"].includes(run.state)) this.fail(run, "P4 inference connection closed before all results arrived"); });
      for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
        if (repetition > 0 && input.intervalMs) await new Promise(resolve => setTimeout(resolve, input.intervalMs));
        for (let lane = 0; lane < input.concurrency; lane += 1) {
          const id = `${run.id}-${repetition + 1}-${lane + 1}`;
          const request: InferenceRequest = { id, state: "queued", prompt: input.prompt, text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, submittedAt: now(), completedAt: null, error: null };
          run.state = "running"; run.requests.push(request); run.submitted += 1; this.timings.get(run.id)!.set(id, { submittedAtMs: Date.now(), prefillRows: 0 });
          await this.write(socket, event({ kind: "node", address: stages[0]!.agent, nodeId: stages[0]!.node, generation: stages[0]!.generation }, PREFILL,
            { load_generation: model.loadGeneration, session_id: run.id, request_id: id, prompt: input.prompt, options: "", max_tokens: input.maxTokens }, id));
          this.publish(run);
        }
      }
    } catch (error) { this.fail(run, error instanceof Error ? error.message : String(error)); }
  }
  private buffers = new WeakMap<Socket, Buffer>();
  private attach(socket: Socket, run: InferenceRun) {
    socket.on("data", chunk => {
      let buffer = Buffer.concat([this.buffers.get(socket) ?? Buffer.alloc(0), chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0); if (!length || length > 8 * 1024 * 1024) { this.fail(run, "P4 inference frame exceeds Studio safety limit"); socket.destroy(); return; }
        if (buffer.length < length + 4) break;
        try { this.handleEvent(run, decodeP4Event(buffer.subarray(4, length + 4))); }
        catch (error) { this.fail(run, error instanceof Error ? error.message : String(error)); socket.destroy(); return; }
        buffer = buffer.subarray(length + 4);
      }
      this.buffers.set(socket, buffer);
    });
  }
  private handleEvent(run: InferenceRun, event: P4Event) {
    if (event.contentType === ERROR) throw new Error(this.errorDetail(event));
    if (event.contentType === BATCH) { this.applyBatch(run, event); return; }
    if (event.contentType !== OUTPUT) return;
    const payload = record(JSON.parse(new TextDecoder().decode(event.payload))); const id = payload && text(payload.request_id); const fragment = payload && text(payload.text); const stop = payload?.stop;
    if (!payload || !id || fragment === null || (stop !== null && stop !== undefined && typeof stop !== "string")) throw new Error("Malformed P4 output payload");
    const request = run.requests.find(value => value.id === id); const timing = this.timings.get(run.id)?.get(id); if (!request || !timing) throw new Error("P4 output references an unknown request");
    const received = Date.now(); request.state = "streaming"; request.text += fragment; request.receivedTokens += 1;
    if (!timing.firstOutputAtMs) { timing.firstOutputAtMs = received; request.ttftMs = received - timing.submittedAtMs; request.prefillTps = rate(timing.prefillRows, request.ttftMs); }
    request.generationTps = rate(request.receivedTokens, received - timing.firstOutputAtMs);
    request.finalTps = rate(request.receivedTokens, received - timing.submittedAtMs);
    if (typeof stop === "string") { request.state = "completed"; request.completedAt = now(); run.completed += 1; if (run.completed === this.expected.get(run.id)) run.state = "completed"; }
    this.publish(run);
  }
  private applyBatch(run: InferenceRun, event: P4Event) {
    const payload = record(JSON.parse(new TextDecoder().decode(event.payload))); const physical = payload && Array.isArray(payload.physical_batches) ? payload.physical_batches : [];
    if (event.source.kind === "node" && payload) {
      const total = (key: string) => physical.reduce((sum, value) => sum + (integer(record(value)?.[key]) ?? 0), 0);
      const batch: InferenceBatch = {
        observationId: text(payload.observation_id) ?? "", logicalOrdinal: integer(payload.logical_ordinal) ?? 0, logicalRows: integer(payload.logical_rows) ?? 0,
        physicalBatchCount: physical.length, mixedPhysicalBatches: integer(payload.mixed_physical_batches) ?? 0,
        rows: total("rows"), prefillRows: total("prefill_rows"), decodeRows: total("decode_rows"), verifyRows: total("verify_rows"), replayRows: total("replay_rows"),
        requestCount: total("request_count"), sequenceCount: total("sequence_count"), stageMs: integer(payload.stage_ms) ?? 0, idleMs: integer(payload.idle_ms) ?? 0,
        idleGated: integer(payload.idle_gated) ?? 0, readyRows: integer(payload.ready_rows) ?? 0, readySequences: integer(payload.ready_sequences) ?? 0,
        scheduling: payload.scheduling ?? null, observedAt: now(),
      };
      const batches = this.latestBatches.get(run.modelId) ?? new Map<string, InferenceBatch>(); batches.set(`${event.source.address}\0${event.source.nodeId}`, batch); this.latestBatches.set(run.modelId, batches);
    }
    for (const batch of physical) {
      const details = record(batch); const owned = details && Array.isArray(details.owned_requests) ? details.owned_requests : [];
      for (const row of owned) { const detail = record(row); const id = detail && text(detail.request_id); const rows = detail && integer(detail.prefill_rows); if (id && rows !== null) { const timing = this.timings.get(run.id)?.get(id); const request = run.requests.find(value => value.id === id); if (timing && request) { timing.prefillRows += rows; if (request.ttftMs !== null) request.prefillTps = rate(timing.prefillRows, request.ttftMs); } } }
    }
    this.publish(run);
  }
  private errorDetail(event: P4Event) { try { const payload = record(JSON.parse(new TextDecoder().decode(event.payload))); return payload && text(payload.detail) || "P4 adapter rejected the inference event"; } catch { return new TextDecoder().decode(event.payload) || "P4 adapter rejected the inference event"; } }
  private open(address: string) { const { host, port } = addressParts(address); return new Promise<Socket>((resolve, reject) => { const socket = connect(agentDialAddress(host, port)); socket.once("connect", () => resolve(socket)); socket.once("error", reject); }); }
  private write(socket: Socket, event: P4Event) { const bytes = encodeP4Event(event); const frame = Buffer.allocUnsafe(bytes.length + 4); frame.writeUInt32LE(bytes.length, 0); frame.set(bytes, 4); return new Promise<void>((resolve, reject) => socket.write(frame, error => error ? reject(error) : resolve())); }
  private read(socket: Socket, accept: (event: P4Event) => boolean, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      let buffer = Buffer.alloc(0); const timer = setTimeout(() => done(new Error("Timed out waiting for P4 SESSION_READY")), timeoutMs);
      const onData = (chunk: Buffer) => { buffer = Buffer.concat([buffer, chunk]); while (buffer.length >= 4) { const length = buffer.readUInt32LE(0); if (!length || length > 8 * 1024 * 1024) return done(new Error("P4 session frame exceeds Studio safety limit")); if (buffer.length < length + 4) return; try { if (accept(decodeP4Event(buffer.subarray(4, length + 4)))) return done(); } catch (error) { return done(error instanceof Error ? error : new Error(String(error))); } buffer = buffer.subarray(length + 4); } };
      const onError = (error: Error) => done(error); const done = (error?: Error) => { clearTimeout(timer); socket.off("data", onData); socket.off("error", onError); if (error) reject(error); else { this.buffers.set(socket, buffer); resolve(); } };
      socket.on("data", onData); socket.once("error", onError);
    });
  }
  connectRun(socket: Socket, run: InferenceRun) { this.attach(socket, run); }
}
