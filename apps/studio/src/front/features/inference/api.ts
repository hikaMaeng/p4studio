import { P4_DELIVERY_FAILURE_CONTENT_TYPE, parseP4DeliveryFailure, type P4AgentSnapshot, type P4Event } from "@p4studio/p4-protocol";
import {
  canAttemptInference, deploymentRoutes, llamaDispatchLimits, parseDeploymentList, parseInferenceRuns,
  classifyP4Output, classifyP4Telemetry, OutputOrdinalBuffer, parseP4ApprovedOutput, parseP4BatchObservation, parseP4StageSpan, type DeploymentRecord, type GraphAgent,
  type InferenceMonitoring, type InferenceRequest, type InferenceRun, type InferenceRunInput, type P4BatchObservation,
} from "@p4studio/studio_domain/common";
import {
  appendMonitoringSample,
  inference,
  InferenceTelemetryCache,
  invalidateLegacyDispatchTiming,
  migrateLegacyTiming,
  recordBatchSummary,
  recordBatchObservability,
  recordOutputObservability,
  recordOutputTiming,
  recordSpanObservability,
  recordSpanSummary,
  emptyRequestTelemetry,
  type InferenceGateway,
  type RequestTiming,
} from "@p4studio/studio_domain/front";
import { BrowserP4Reception, readAgentTopology } from "../../p4/reception.js";
import { inspectGraphAgent } from "../../p4/inspection.js";
import { recordSessionProof } from "../models/api.js";
import { wireOptions, wirePrompt } from "./prompt.js";

// See apps/studio/docs/api.md#browser-owned-inference.
const SESSION = "application/vnd.p4.llamacpp.session-v4+json";
const SESSION_READY = "application/vnd.p4.llamacpp.session-ready-v4+json";
const PREFILL = "application/vnd.p4.llamacpp.prefill-v3+json";
const ERROR = "application/vnd.p4.llamacpp.error-v2+json";
const runs = new Map<string, InferenceRun>();
const listeners = new Map<string, Set<(run: InferenceRun) => void>>();
const telemetry = new InferenceTelemetryCache();
const monitoringRequests = new Map<string, Promise<InferenceMonitoring>>();
const monitoringLoops = new Map<string, object>();
let monitoringInspectionInFlight = false;
const HISTORY_KEY = "p4studio.inference.history.v1";
const publishTimers = new Map<string, number>();
let persistTimer: number | undefined;

type Stage = { stageIndex: number; agentId: string; agentName: string; address: string; nodeId: string; generation: number };
type Inspection = { snapshot: P4AgentSnapshot | null; observedAt: string; error: string | null };

export const MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_MAX_TOKENS = MAX_OUTPUT_TOKENS;
const RUN_PUBLISH_INTERVAL_MS = 250;
const PERSIST_INTERVAL_MS = 3000;
const MONITORING_SAMPLE_INTERVAL_MS = 2000;

function wireMaxTokens(model: DeploymentRecord, maxTokens: number): number {
  const limits = llamaDispatchLimits(model.stages);
  if (!limits) throw new Error("The selected deployment has no valid llama.cpp resource_profile admission limits");
  if (maxTokens < 1) return DEFAULT_MAX_TOKENS;
  const maxAllowed = Math.min(MAX_OUTPUT_TOKENS, limits.maxOutputTokensPerRequest);
  if (maxTokens > maxAllowed) throw new Error(`Requested ${maxTokens} generated tokens exceed the limit of ${maxAllowed}`);
  return maxTokens;
}

const persist = () => { try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ timingVersion: 3, runs: [...runs.values()] })); } catch { /* storage is optional */ } };
const restore = () => {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY); if (!raw) return;
    const stored: unknown = JSON.parse(raw);
    const version = stored !== null && typeof stored === "object" && "timingVersion" in stored && typeof stored.timingVersion === "number" ? stored.timingVersion : 1;
    for (const run of parseInferenceRuns(stored).runs) {
      if (version < 2) run.requests.forEach(migrateLegacyTiming);
      if (version < 3) run.requests.forEach(invalidateLegacyDispatchTiming);
      if (["preparing", "running"].includes(run.state)) {
        run.state = "unknown"; run.error ??= "The browser inference session ended before all results arrived";
        run.requests.forEach(request => { if (["queued", "streaming"].includes(request.state)) { request.state = "unknown"; request.error ??= run.error; } });
      }
      runs.set(run.id, run);
    }
  } catch { /* ignore stale or unavailable history */ }
};
restore();
window.addEventListener("pagehide", persist);

async function request(path: string, method = "GET"): Promise<unknown> {
  const response = await fetch(path, { method }); const value: unknown = await response.json();
  if (!response.ok) {
    const error = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(error && typeof error === "object" && "message" in error ? String(error.message) : String(response.status));
  }
  return value;
}
// Coalesce rendering/persistence, never token accounting or arrival timestamps.
const publish = (run: InferenceRun) => {
  const terminal = !["preparing", "running"].includes(run.state);
  if (terminal) {
    window.clearTimeout(publishTimers.get(run.id)); publishTimers.delete(run.id);
    window.clearTimeout(persistTimer); persistTimer = undefined;
    persist(); listeners.get(run.id)?.forEach(listener => listener(structuredClone(run))); return;
  }
  if (!publishTimers.has(run.id)) publishTimers.set(run.id, window.setTimeout(() => {
    publishTimers.delete(run.id);
    listeners.get(run.id)?.forEach(listener => listener(structuredClone(run)));
  }, RUN_PUBLISH_INTERVAL_MS));
  if (persistTimer === undefined) persistTimer = window.setTimeout(() => { persistTimer = undefined; persist(); }, PERSIST_INTERVAL_MS);
};
const now = () => new Date().toISOString();
const rate = (rows: number, elapsedMs: number) => rows > 0 && elapsedMs > 0 ? rows * 1000 / elapsedMs : null;

async function records() {
  return parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method)).deployments;
}

function stagesFor(model: DeploymentRecord, registered: GraphAgent[]): Stage[] {
  return model.stages.map((stage, stageIndex) => ({
    stageIndex, agentId: stage.agentId, agentName: registered.find(agent => agent.id === stage.agentId)?.name ?? stage.agentId,
    address: model.resolvedAddresses[stage.agentId] ?? "", nodeId: stage.nodeId, generation: stage.nodeGeneration,
  }));
}

function monitoringSnapshot(model: DeploymentRecord, stages: Stage[], inspections: Map<string, Inspection>, generatedAt: string): InferenceMonitoring {
  const agentStages = [...new Map(stages.map(stage => [stage.agentId, stage])).values()];
  return { modelId: model.id, generatedAt, agents: agentStages.map(stage => {
    const broker = inspections.get(stage.agentId)?.snapshot?.broker ?? null; const receipts = broker?.receipts ?? null;
    return { agentId: stage.agentId, agentName: stage.agentName, broker: broker === null ? null : {
      sampledAtUnixMs: broker.sampledAtUnixMs, state: broker.state, detail: broker.detail,
      duplicateWindow: receipts?.duplicateWindow ?? null, indexedEvents: receipts?.indexed.events ?? null,
      allocatedEvents: receipts?.allocated.events ?? null, allocatedEventBytes: receipts?.allocated.eventBytes ?? null,
      allocatedPayloadCapacityBytes: receipts?.allocated.payloadCapacityBytes ?? null, unmeasuredEvents: receipts?.allocated.unmeasuredEvents ?? null,
      peakAllocatedEventBytes: receipts?.peakAllocatedEventBytes ?? null, committedEvents: receipts?.committedEvents ?? null,
      evictedEvents: receipts?.evictedEvents ?? null, freedEvents: receipts?.freedEvents ?? null,
      eventIndexCapacity: receipts?.eventIndexCapacity ?? null, orderCapacity: receipts?.orderCapacity ?? null,
      sequenceEntries: receipts?.sequenceEntries ?? null, sequenceCapacity: receipts?.sequenceCapacity ?? null,
    } };
  }), nodes: stages.map(stage => {
    const inspection = inspections.get(stage.agentId); const snapshot = inspection?.snapshot ?? null;
    const node = snapshot?.nodes.find(value => value.nodeId === stage.nodeId && value.generation === stage.generation);
    const latestBatch = telemetry.batch(model.id, stage.address, stage.nodeId, stage.generation);
    const latestSpan = telemetry.span(model.id, stage.address, stage.nodeId, stage.generation);
    const hasTelemetry = latestBatch !== null || latestSpan !== null;
    return {
      stageIndex: stage.stageIndex, agentId: stage.agentId, agentName: stage.agentName, nodeId: stage.nodeId, nodeGeneration: stage.generation,
      reachability: snapshot || hasTelemetry ? "reachable" as const : inspection?.error ? "unreachable" as const : "unknown" as const,
      observationState: snapshot || hasTelemetry ? "available" as const : inspection?.error ? "error" as const : "pending" as const,
      observedAt: inspection?.observedAt ?? latestBatch?.observedAt ?? latestSpan?.observedAt ?? null,
      adapterState: node?.state ?? null,
      delivery: node?.delivery ?? null,
      gpus: (snapshot?.machine.occupancy.gpus ?? []).map((gpu, index) => {
        const capability = snapshot?.machine.capability.gpus.find(value => value.uuid === gpu.uuid);
        return { index: capability?.index ?? index, name: capability?.name ?? gpu.uuid, vramUsedBytes: gpu.vramUsedBytes, vramFreeBytes: gpu.vramFreeBytes, utilizationGpuPercent: gpu.utilizationGpuPercent, temperatureC: gpu.temperatureC, powerDrawW: gpu.powerDrawW };
      }),
      latestBatch, latestSpan, error: inspection?.error ?? null,
    };
  }) };
}

async function inspectModel(modelId: string): Promise<InferenceMonitoring> {
  const model = (await records()).find(value => value.id === modelId); if (!model) throw new Error("Model deployment was not found");
  const topology = await readAgentTopology(); const registered = topology.agents; const stages = stagesFor(model, registered); const inspections = new Map<string, Inspection>();
  for (const agentId of new Set(stages.map(stage => stage.agentId))) {
    const agent = registered.find(value => value.id === agentId); const observedAt = now();
    if (!agent) { inspections.set(agentId, { snapshot: null, observedAt, error: "Agent registration was not found" }); continue; }
    try { inspections.set(agentId, { snapshot: await inspectGraphAgent(agent, topology), observedAt, error: null }); }
    catch (error) { inspections.set(agentId, { snapshot: null, observedAt, error: error instanceof Error ? error.message : String(error) }); }
  }
  const snapshot = monitoringSnapshot(model, stages, inspections, now());
  for (const run of runs.values()) if (run.modelId === model.id && ["preparing", "running"].includes(run.state)) {
    appendMonitoringSample(run, snapshot);
    publish(run);
  }
  return snapshot;
}

async function inspectModelWithinBudget(modelId: string) {
  // Model inspections are browser-owned polling work. Skip a tick if another model is still
  // being inspected instead of allowing slow agents to accumulate concurrent polling load.
  if (monitoringInspectionInFlight) return;
  monitoringInspectionInFlight = true;
  try { await inspectModel(modelId); }
  finally { monitoringInspectionInFlight = false; }
}

function hasActiveRun(modelId: string) {
  return [...runs.values()].some(run => run.modelId === modelId && ["preparing", "running"].includes(run.state));
}

function ensureMonitoringLoop(modelId: string) {
  if (monitoringLoops.has(modelId)) return;
  const loop = {};
  monitoringLoops.set(modelId, loop);
  void (async () => {
    while (hasActiveRun(modelId)) {
      try { await inspectModelWithinBudget(modelId); } catch {
        // Monitoring is best-effort and must not change the inference result.
      }
      if (!hasActiveRun(modelId)) break;
      await new Promise<void>(resolve => window.setTimeout(resolve, MONITORING_SAMPLE_INTERVAL_MS));
    }
  })().finally(() => {
    if (monitoringLoops.get(modelId) !== loop) return;
    monitoringLoops.delete(modelId);
    if (hasActiveRun(modelId)) ensureMonitoringLoop(modelId);
  });
}

const gateway: InferenceGateway = {
  list: async () => [...runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  remove: runId => {
    if (!runs.delete(runId)) return;
    window.clearTimeout(publishTimers.get(runId));
    publishTimers.delete(runId);
    listeners.delete(runId);
    persist();
  },
  create: async input => {
    const model = (await records()).find(value => value.id === input.modelId);
    if (!model || !canAttemptInference(model) || model.adapter !== "llamacpp" || !model.loadGeneration || model.stages.length < 2) throw new Error("The selected distributed llama.cpp deployment is not ready for a SESSION-gated inference attempt");
    const limits = llamaDispatchLimits(model.stages);
    if (!limits) throw new Error("The selected deployment has no valid llama.cpp resource_profile admission limits");
    const maxAllowed = Math.min(MAX_OUTPUT_TOKENS, limits.maxOutputTokensPerRequest);
    if (input.maxTokens > maxAllowed) throw new Error(`Requested ${input.maxTokens} generated tokens exceed the limit of ${maxAllowed}`);
    const run: InferenceRun = { id: crypto.randomUUID(), modelId: model.id, modelName: model.name, state: "preparing", submitted: 0, completed: 0, createdAt: now(), error: null, settings: { concurrency: input.concurrency, repetitions: input.repetitions, intervalMs: input.intervalMs, maxTokens: input.maxTokens }, nUbatch: model.nUbatch, monitoring: [], monitoringSummary: null, telemetrySeries: { version: 1, output: [], batches: [], spans: [] }, requests: [] };
    runs.set(run.id, run); publish(run); ensureMonitoringLoop(model.id); void execute(run, model, input); return run;
  },
  subscribe: (id, onRun) => {
    const set = listeners.get(id) ?? new Set(); set.add(onRun); listeners.set(id, set); const run = runs.get(id); if (run) onRun(structuredClone(run));
    return () => { set.delete(onRun); if (!set.size) listeners.delete(id); };
  },
  monitoring: modelId => {
    const pending = monitoringRequests.get(modelId); if (pending) return pending;
    const next = inspectModel(modelId).finally(() => monitoringRequests.delete(modelId)); monitoringRequests.set(modelId, next); return next;
  },
};

function stageFor(event: P4Event, stages: Stage[]) {
  const source = event.source; if (source.kind !== "node") return null;
  return stages.find(stage => stage.address === source.address && stage.nodeId === source.nodeId && stage.generation === source.generation) ?? null;
}

function recordBatchTiming(run: InferenceRun, value: P4BatchObservation, timings: Map<string, RequestTiming>) {
  for (const owned of value.physical_batches.flatMap(batch => batch.owned_requests)) {
    const timing = timings.get(owned.request_id); const request = run.requests.find(item => item.id === owned.request_id); if (!timing || !request) continue;
    timing.prefillRows += owned.prefill_rows; if (request.ttftMs !== null) request.prefillTps = rate(timing.prefillRows, request.ttftMs);
  }
}

async function execute(run: InferenceRun, model: DeploymentRecord, input: InferenceRunInput) {
  let connection: BrowserP4Reception | undefined; const timings = new Map<string, RequestTiming>();
  // Keyed by request ID and by PREFILL event ID; one entry per submitted request, dropped with this execution.
  const outputs = new Map<string, OutputOrdinalBuffer>(); const submissions = new Map<string, string>();
  try {
    const topology = await readAgentTopology();
    const stages = stagesFor(model, topology.agents); if (stages.some(stage => !stage.address)) throw new Error("A model stage has no recorded P4 endpoint");
    connection = new BrowserP4Reception(topology, new Map(Object.entries(model.resolvedAddresses)));
    for (const stage of stages) {
      const event = await connection.exchange({ kind: "node", address: stage.address, nodeId: stage.nodeId, generation: stage.generation }, "llamacpp", SESSION,
        { load_generation: model.loadGeneration, session_id: run.id, stages: stages.map(value => ({ agent: value.address, node: value.nodeId, generation: value.generation })), stage_index: stage.stageIndex }, [SESSION_READY, ERROR], model.timeoutMs);
      if (event.contentType === ERROR) throw new Error(new TextDecoder().decode(event.payload));
      if (event.contentType !== SESSION_READY || stageFor(event, stages)?.stageIndex !== stage.stageIndex) throw new Error("P4 SESSION_READY source or content type does not match the configured stage");
      const proof: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(event.payload));
      if (!proof || typeof proof !== "object" || !("state" in proof) || proof.state !== "ready"
        || !("session_id" in proof) || proof.session_id !== run.id
        || !("load_generation" in proof) || proof.load_generation !== model.loadGeneration) {
        throw new Error("P4 SESSION_READY does not prove the active session and load generation");
      }
    }
    try {
      await recordSessionProof(model.id, run.id, now(), model.loadGeneration,
        Object.fromEntries(model.stages.map(stage => [stage.id, stage.nodeGeneration])));
    } catch {
      // P4 has already confirmed this exact session on every captured stage.
      // Studio's receipt is observability; a temporary persistence failure must
      // not discard the live, generation-bound P4 session before PREFILL.
    }
    run.state = "running"; publish(run); const expected = input.concurrency * input.repetitions;
    const stop = connection.onEvent((event, receivedAtMs) => {
      if (!connection!.owns(event.target)) return;
      if (event.contentType === P4_DELIVERY_FAILURE_CONTENT_TYPE) {
        // A transport diagnostic. Only a PREFILL that provably never left ends its request as failed.
        try {
          const notice = parseP4DeliveryFailure(event.payload); const requestId = submissions.get(notice.eventId);
          if (requestId) fail(run, `P4 delivery failure for request ${requestId}: ${notice.result}`, notice.result === "not_started" ? "failed" : "unknown");
        } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); }
        return;
      }
      if (event.adapterKind !== "llamacpp") return;
      if (event.contentType === ERROR) { fail(run, new TextDecoder().decode(event.payload), "failed"); return; }
      try {
        const stage = stageFor(event, stages);
        const telemetryKind = classifyP4Telemetry(event.contentType);
        if (telemetryKind === "unsupported") throw new Error(`Unsupported P4 telemetry contract ${event.contentType}`);
        if (telemetryKind) {
          if (!stage) throw new Error("P4 telemetry source does not match a configured model stage"); const observedAt = now();
          if (telemetryKind === "batch-observation") {
            const value = parseP4BatchObservation(JSON.parse(new TextDecoder().decode(event.payload)));
            if (value.load_generation !== model.loadGeneration || value.session_id !== run.id) throw new Error("P4 batch observation identity does not match the active run");
            telemetry.recordBatch(model.id, stage.address, stage.nodeId, stage.generation, value, observedAt);
            if (recordBatchSummary(run, stage, value, observedAt)) { recordBatchTiming(run, value, timings); recordBatchObservability(run, stage, value, observedAt); }
          } else {
            const value = parseP4StageSpan(JSON.parse(new TextDecoder().decode(event.payload)));
            if (value.load_generation !== model.loadGeneration || value.session_id !== run.id) throw new Error("P4 stage span identity does not match the active run");
            telemetry.recordSpan(model.id, stage.address, stage.nodeId, stage.generation, value, observedAt);
            if (recordSpanSummary(run, stage, value, observedAt)) recordSpanObservability(run, stage, value, observedAt);
          }
          publish(run); return;
        }
        const outputKind = classifyP4Output(event.contentType);
        if (outputKind === "unsupported") throw new Error(`Unsupported P4 output contract ${event.contentType}`);
        if (outputKind !== "output") return;
        const approved = parseP4ApprovedOutput(JSON.parse(new TextDecoder().decode(event.payload)));
        if (approved.load_generation !== model.loadGeneration || approved.session_id !== run.id) throw new Error("P4 output identity does not match the active run");
        const item = run.requests.find(value => value.id === approved.request_id); const timing = timings.get(approved.request_id); const buffer = outputs.get(approved.request_id);
        if (!item || !timing || !buffer) throw new Error("P4 output references an unknown request");
        if (submissions.get(approved.submission_event_id) !== item.id) throw new Error("P4 output does not name the PREFILL submission of its request");
        // Arrival order is not delivery order: consume by the head-approved ordinal only.
        for (const output of buffer.accept(approved)) {
          const terminal = output.stop !== null;
          item.state = "streaming"; item.text += output.text;
          recordOutputTiming(item, timing, receivedAtMs, terminal);
          if (terminal) { item.state = "completed"; item.completedAt = now(); run.completed += 1; if (run.completed === expected) { run.state = "completed"; stop(); connection?.close(); } }
          recordOutputObservability(run, Date.now(), terminal);
        }
        publish(run);
      } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); }
    });
    for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
      if (repetition && input.intervalMs) await new Promise(resolve => window.setTimeout(resolve, input.intervalMs));
      for (let lane = 0; lane < input.concurrency; lane += 1) {
        const id = `${run.id}-${repetition + 1}-${lane + 1}`;
        const maxTokens = wireMaxTokens(model, input.maxTokens);
        outputs.set(id, new OutputOrdinalBuffer(maxTokens));
        const receipt = connection.dispatch({ kind: "node", address: stages[0]!.address, nodeId: stages[0]!.nodeId, generation: stages[0]!.generation }, "llamacpp", PREFILL, { load_generation: model.loadGeneration, session_id: run.id, request_id: id, prompt: wirePrompt(model, input.prompt), options: wireOptions(model), max_tokens: maxTokens }, 1);
        submissions.set(receipt.event.eventId, id);
        const item: InferenceRequest = { id, state: "queued", prompt: input.prompt, text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, waveIndex: repetition + 1, submittedAt: receipt.sentAt, completedAt: null, error: null, telemetry: emptyRequestTelemetry() };
        run.requests.push(item); run.submitted += 1; timings.set(id, { sentAtMs: receipt.sentAtMs, firstOutputAtMs: null, prefillRows: 0 });
      }
      publish(run);
      await waitForWave(run, repetition + 1);
    }
  } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); connection?.close(); }
}

function waitForWave(run: InferenceRun, waveIndex: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const requests = run.requests.filter(request => request.waveIndex === waveIndex);
      if (requests.length > 0 && requests.every(request => request.state === "completed")) {
        resolve(); return;
      }
      if (!["preparing", "running"].includes(run.state)) {
        reject(new Error(run.error ?? `Inference wave ${waveIndex} did not complete`)); return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

function fail(run: InferenceRun, detail: string, disposition: "failed" | "unknown" = "unknown") {
  if (!["preparing", "running"].includes(run.state)) return;
  run.error = detail; run.state = disposition === "failed" ? "failed" : run.requests.some(item => item.state === "streaming") ? "unknown" : "failed";
  run.requests.forEach(item => { if (["queued", "streaming"].includes(item.state)) { item.state = run.state === "failed" ? "failed" : "unknown"; item.error = detail; } }); publish(run);
}
export const startInference = () => inference.start(gateway);
