import { sameEndpoint, type P4AgentSnapshot, type P4Event } from "@p4studio/p4-protocol";
import {
  deploymentRoutes, graphAgentListSchema, graphInventoryRoutes, parseDeploymentList, parseInferenceRuns,
  parseP4BatchObservation, parseP4StageSpan, type DeploymentRecord, type GraphAgent,
  type InferenceMonitoring, type InferenceRequest, type InferenceRun, type InferenceRunInput, type P4BatchObservation,
} from "@p4studio/studio_domain/common";
import { appendMonitoring, inference, InferenceTelemetryCache, type InferenceGateway } from "@p4studio/studio_domain/front";
import { BrowserP4Connection } from "../../p4/connection.js";
import { inspectGraphAgent } from "../../p4/inspection.js";

// See apps/studio/docs/api.md#browser-owned-inference.
const SESSION = "application/vnd.p4.llamacpp.session-v4+json";
const SESSION_READY = "application/vnd.p4.llamacpp.session-ready-v4+json";
const PREFILL = "application/vnd.p4.llamacpp.prefill-v3+json";
const OUTPUT = "application/vnd.p4.llamacpp.output-v5+json";
const BATCH = "application/vnd.p4.llamacpp.batch-observation-v4+json";
const STAGE_SPAN = "application/vnd.p4.llamacpp.stage-span-v4+json";
const ERROR = "application/vnd.p4.llamacpp.error-v2+json";
const runs = new Map<string, InferenceRun>();
const listeners = new Map<string, Set<(run: InferenceRun) => void>>();
const telemetry = new InferenceTelemetryCache();
const monitoringRequests = new Map<string, Promise<InferenceMonitoring>>();
const HISTORY_KEY = "p4studio.inference.history.v1";

type Stage = { stageIndex: number; agentId: string; agentName: string; address: string; nodeId: string; generation: number };
type Inspection = { snapshot: P4AgentSnapshot | null; observedAt: string; error: string | null };
type RequestTiming = { submittedAtMs: number; firstOutputAtMs: number | null; prefillRows: number };

const persist = () => { try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ runs: [...runs.values()] })); } catch { /* storage is optional */ } };
const restore = () => { try { const raw = window.localStorage.getItem(HISTORY_KEY); if (!raw) return; for (const run of parseInferenceRuns(JSON.parse(raw)).runs) runs.set(run.id, run); } catch { /* ignore stale or unavailable history */ } };
restore();

async function request(path: string, method = "GET"): Promise<unknown> {
  const response = await fetch(path, { method }); const value: unknown = await response.json();
  if (!response.ok) {
    const error = value && typeof value === "object" && "error" in value ? value.error : null;
    throw new Error(error && typeof error === "object" && "message" in error ? String(error.message) : String(response.status));
  }
  return value;
}
const publish = (run: InferenceRun) => { persist(); listeners.get(run.id)?.forEach(listener => listener(structuredClone(run))); };
const now = () => new Date().toISOString();
const rate = (rows: number, elapsedMs: number) => rows > 0 && elapsedMs > 0 ? rows * 1000 / elapsedMs : null;

async function records() {
  return parseDeploymentList(await request(deploymentRoutes.list.path, deploymentRoutes.list.method)).deployments;
}

async function agents() {
  return graphAgentListSchema.parse(await request(graphInventoryRoutes.agents.path, graphInventoryRoutes.agents.method)).agents;
}

function stagesFor(model: DeploymentRecord, registered: GraphAgent[]): Stage[] {
  return model.stages.map((stage, stageIndex) => ({
    stageIndex, agentId: stage.agentId, agentName: registered.find(agent => agent.id === stage.agentId)?.name ?? stage.agentId,
    address: model.resolvedAddresses[stage.agentId] ?? "", nodeId: stage.nodeId, generation: stage.nodeGeneration,
  }));
}

function monitoringSnapshot(model: DeploymentRecord, stages: Stage[], inspections: Map<string, Inspection>, generatedAt: string): InferenceMonitoring {
  return { modelId: model.id, generatedAt, nodes: stages.map(stage => {
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
  const registered = await agents(); const stages = stagesFor(model, registered); const inspections = new Map<string, Inspection>();
  for (const agentId of new Set(stages.map(stage => stage.agentId))) {
    const agent = registered.find(value => value.id === agentId); const observedAt = now();
    if (!agent) { inspections.set(agentId, { snapshot: null, observedAt, error: "Agent registration was not found" }); continue; }
    try { inspections.set(agentId, { snapshot: await inspectGraphAgent(agent), observedAt, error: null }); }
    catch (error) { inspections.set(agentId, { snapshot: null, observedAt, error: error instanceof Error ? error.message : String(error) }); }
  }
  const snapshot = monitoringSnapshot(model, stages, inspections, now());
  for (const run of runs.values()) if (run.modelId === model.id && ["preparing", "running"].includes(run.state) && appendMonitoring(run, snapshot)) publish(run);
  return snapshot;
}

const gateway: InferenceGateway = {
  list: async () => [...runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  create: async input => {
    const model = (await records()).find(value => value.id === input.modelId);
    if (!model || model.status !== "ready" || model.adapter !== "llamacpp" || !model.loadGeneration || model.stages.length < 2) throw new Error("The selected distributed llama.cpp deployment is not ready");
    const run: InferenceRun = { id: crypto.randomUUID(), modelId: model.id, modelName: model.name, state: "preparing", submitted: 0, completed: 0, createdAt: now(), error: null, monitoring: [], requests: [] };
    runs.set(run.id, run); publish(run); void execute(run, model, input); return run;
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
  let connection: BrowserP4Connection | undefined; const timings = new Map<string, RequestTiming>();
  try {
    const ingressAddress = model.resolvedAddresses[model.ingressAgentId]; if (!ingressAddress) throw new Error("The loaded model has no recorded ingress endpoint");
    const stages = stagesFor(model, await agents()); if (stages.some(stage => !stage.address)) throw new Error("A model stage has no recorded P4 endpoint");
    connection = await BrowserP4Connection.open(model.ingressAgentId, ingressAddress);
    for (const stage of stages) {
      const event = await connection.exchange({ kind: "node", address: stage.address, nodeId: stage.nodeId, generation: stage.generation }, "llamacpp", SESSION,
        { load_generation: model.loadGeneration, session_id: run.id, stages: stages.map(value => ({ agent: value.address, node: value.nodeId, generation: value.generation })), stage_index: stage.stageIndex }, [SESSION_READY, ERROR], model.timeoutMs);
      if (event.contentType === ERROR) throw new Error(new TextDecoder().decode(event.payload));
    }
    run.state = "running"; publish(run); const expected = input.concurrency * input.repetitions;
    const stop = connection.onEvent(event => {
      if (!sameEndpoint(event.target, connection!.outer) || event.adapterKind !== "llamacpp") return;
      if (event.contentType === ERROR) { fail(run, new TextDecoder().decode(event.payload)); return; }
      try {
        const stage = stageFor(event, stages);
        if (event.contentType === BATCH || event.contentType === STAGE_SPAN) {
          if (!stage) throw new Error("P4 telemetry source does not match a configured model stage"); const observedAt = now();
          if (event.contentType === BATCH) {
            const value = parseP4BatchObservation(JSON.parse(new TextDecoder().decode(event.payload)));
            if (value.load_generation !== model.loadGeneration || value.session_id !== run.id) throw new Error("P4 batch observation identity does not match the active run");
            telemetry.recordBatch(model.id, stage.address, stage.nodeId, stage.generation, value, observedAt); recordBatchTiming(run, value, timings);
          } else {
            const value = parseP4StageSpan(JSON.parse(new TextDecoder().decode(event.payload)));
            if (value.load_generation !== model.loadGeneration || value.session_id !== run.id) throw new Error("P4 stage span identity does not match the active run");
            telemetry.recordSpan(model.id, stage.address, stage.nodeId, stage.generation, value, observedAt);
          }
          appendMonitoring(run, monitoringSnapshot(model, stages, new Map(), observedAt)); publish(run); return;
        }
        if (event.contentType !== OUTPUT) return;
        const payload = JSON.parse(new TextDecoder().decode(event.payload)) as { request_id?: unknown; text?: unknown; stop?: unknown };
        if (typeof payload.request_id !== "string" || typeof payload.text !== "string") throw new Error("Malformed P4 output payload");
        const item = run.requests.find(value => value.id === payload.request_id); const timing = timings.get(payload.request_id); if (!item || !timing) throw new Error("P4 output references an unknown request");
        const receivedAt = Date.now(); item.state = "streaming"; item.text += payload.text; item.receivedTokens += 1;
        if (timing.firstOutputAtMs === null) { timing.firstOutputAtMs = receivedAt; item.ttftMs = receivedAt - timing.submittedAtMs; item.prefillTps = rate(timing.prefillRows, item.ttftMs); }
        item.generationTps = rate(item.receivedTokens, receivedAt - timing.firstOutputAtMs); item.finalTps = rate(item.receivedTokens, receivedAt - timing.submittedAtMs);
        if (typeof payload.stop === "string") { item.state = "completed"; item.completedAt = now(); run.completed += 1; if (run.completed === expected) { run.state = "completed"; stop(); connection?.close(); } }
        publish(run);
      } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); }
    });
    for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
      if (repetition && input.intervalMs) await new Promise(resolve => window.setTimeout(resolve, input.intervalMs));
      for (let lane = 0; lane < input.concurrency; lane += 1) {
        const id = `${run.id}-${repetition + 1}-${lane + 1}`;
        const item: InferenceRequest = { id, state: "queued", prompt: input.prompt, text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, submittedAt: now(), completedAt: null, error: null };
        run.requests.push(item); run.submitted += 1; timings.set(id, { submittedAtMs: Date.now(), firstOutputAtMs: null, prefillRows: 0 });
        connection.dispatch({ kind: "node", address: stages[0]!.address, nodeId: stages[0]!.nodeId, generation: stages[0]!.generation }, "llamacpp", PREFILL, { load_generation: model.loadGeneration, session_id: run.id, request_id: id, prompt: input.prompt, options: "", max_tokens: input.maxTokens }, 1);
      }
      publish(run);
    }
  } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); connection?.close(); }
}

function fail(run: InferenceRun, detail: string) {
  if (!["preparing", "running"].includes(run.state)) return;
  run.error = detail; run.state = run.requests.some(item => item.state === "streaming") ? "unknown" : "failed";
  run.requests.forEach(item => { if (["queued", "streaming"].includes(item.state)) { item.state = "unknown"; item.error = detail; } }); publish(run);
}
export const startInference = () => inference.start(gateway);
