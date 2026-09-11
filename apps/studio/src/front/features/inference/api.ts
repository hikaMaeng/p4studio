import { deploymentRoutes, parseInferenceRuns, type DeploymentRecord, type InferenceMonitoring, type InferenceRequest, type InferenceRun, type InferenceRunInput } from "@p4studio/studio_domain/common";
import { inference, type InferenceGateway } from "@p4studio/studio_domain/front";
import { BrowserP4Connection } from "../../p4/connection.js";

const SESSION = "application/vnd.p4.llamacpp.session-v4+json";
const SESSION_READY = "application/vnd.p4.llamacpp.session-ready-v4+json";
const PREFILL = "application/vnd.p4.llamacpp.prefill-v3+json";
const OUTPUT = "application/vnd.p4.llamacpp.output-v5+json";
const ERROR = "application/vnd.p4.llamacpp.error-v2+json";
const runs = new Map<string, InferenceRun>();
const listeners = new Map<string, Set<(run: InferenceRun) => void>>();
const HISTORY_KEY = "p4studio.inference.history.v1";

const persist = () => { try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ runs: [...runs.values()] })); } catch { /* storage is optional */ } };
const restore = () => { try { const raw = window.localStorage.getItem(HISTORY_KEY); if (!raw) return; for (const run of parseInferenceRuns(JSON.parse(raw)).runs) runs.set(run.id, run); } catch { /* ignore stale or unavailable history */ } };
restore();

async function request<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(path, { method }); const value: unknown = await response.json();
  if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value ? String((value as { error?: { message?: string } }).error?.message) : String(response.status));
  return value as T;
}
const publish = (run: InferenceRun) => { persist(); listeners.get(run.id)?.forEach(listener => listener(structuredClone(run))); };
const now = () => new Date().toISOString();

const gateway: InferenceGateway = {
  list: async () => [...runs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  create: async input => {
    const models = await request<{ deployments: DeploymentRecord[] }>(deploymentRoutes.list.path);
    const model = models.deployments.find(value => value.id === input.modelId);
    if (!model || model.status !== "ready" || model.adapter !== "llamacpp" || !model.loadGeneration || model.stages.length < 2) throw new Error("The selected distributed llama.cpp deployment is not ready");
    const run: InferenceRun = { id: crypto.randomUUID(), modelId: model.id, modelName: model.name, state: "preparing", submitted: 0, completed: 0, createdAt: now(), error: null, monitoring: [], requests: [] };
    runs.set(run.id, run); publish(run); void execute(run, model, input); return run;
  },
  subscribe: (id, onRun, onError) => {
    const set = listeners.get(id) ?? new Set(); set.add(onRun); listeners.set(id, set); const run = runs.get(id); if (run) onRun(structuredClone(run));
    return () => { set.delete(onRun); if (!set.size) listeners.delete(id); };
  },
  monitoring: async modelId => {
    const models = await request<{ deployments: DeploymentRecord[] }>(deploymentRoutes.list.path); const model = models.deployments.find(value => value.id === modelId);
    if (!model) throw new Error("Model deployment was not found");
    const agents = await request<{ agents: Array<{ id: string; name: string }> }>("/api/snapshot");
    return { modelId, generatedAt: now(), nodes: model.stages.map((stage, stageIndex) => ({ stageIndex, agentId: stage.agentId, agentName: agents.agents.find(agent => agent.id === stage.agentId)?.name ?? stage.agentId, nodeId: stage.nodeId, nodeGeneration: stage.nodeGeneration, reachability: "unknown" as const, observationState: "pending" as const, observedAt: null, adapterState: null, gpus: [], latestBatch: null })) } satisfies InferenceMonitoring;
  },
};

async function execute(run: InferenceRun, model: DeploymentRecord, input: InferenceRunInput) {
  let connection: BrowserP4Connection | undefined;
  try {
    const ingressAddress = model.resolvedAddresses[model.ingressAgentId]; if (!ingressAddress) throw new Error("The loaded model has no recorded ingress endpoint");
    connection = await BrowserP4Connection.open(model.ingressAgentId, ingressAddress);
    const stages = model.stages.map(stage => {
      const address = model.resolvedAddresses[stage.agentId]; if (!address) throw new Error(`No recorded endpoint for stage ${stage.id}`);
      return { address, nodeId: stage.nodeId, generation: stage.nodeGeneration };
    });
    for (const [stageIndex, stage] of stages.entries()) {
      const event = await connection.exchange({ kind: "node", address: stage.address, nodeId: stage.nodeId, generation: stage.generation }, "llamacpp", SESSION,
        { load_generation: model.loadGeneration, session_id: run.id, stages: stages.map(value => ({ agent: value.address, node: value.nodeId, generation: value.generation })), stage_index: stageIndex }, [SESSION_READY, ERROR], model.timeoutMs);
      if (event.contentType === ERROR) throw new Error(new TextDecoder().decode(event.payload));
    }
    run.state = "running"; publish(run);
    const expected = input.concurrency * input.repetitions;
    const stop = connection.onEvent(event => {
      if (event.contentType === ERROR) { fail(run, new TextDecoder().decode(event.payload)); return; }
      if (event.contentType !== OUTPUT) return;
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.payload)) as { request_id?: unknown; text?: unknown; stop?: unknown };
        if (typeof payload.request_id !== "string" || typeof payload.text !== "string") throw new Error("Malformed P4 output payload");
        const item = run.requests.find(value => value.id === payload.request_id); if (!item) return;
        item.state = "streaming"; item.text += payload.text; item.receivedTokens += 1;
        const elapsed = Math.max(1, Date.now() - Date.parse(item.submittedAt)); item.finalTps = item.receivedTokens * 1000 / elapsed;
        if (item.ttftMs === null) item.ttftMs = elapsed;
        if (typeof payload.stop === "string") { item.state = "completed"; item.completedAt = now(); run.completed += 1; if (run.completed === expected) { run.state = "completed"; stop(); connection?.close(); } }
        publish(run);
      } catch (error) { fail(run, error instanceof Error ? error.message : String(error)); }
    });
    for (let repetition = 0; repetition < input.repetitions; repetition += 1) {
      if (repetition && input.intervalMs) await new Promise(resolve => window.setTimeout(resolve, input.intervalMs));
      for (let lane = 0; lane < input.concurrency; lane += 1) {
        const id = `${run.id}-${repetition + 1}-${lane + 1}`;
        const item: InferenceRequest = { id, state: "queued", prompt: input.prompt, text: "", receivedTokens: 0, prefillTps: null, generationTps: null, ttftMs: null, finalTps: null, submittedAt: now(), completedAt: null, error: null };
        run.requests.push(item); run.submitted += 1;
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
