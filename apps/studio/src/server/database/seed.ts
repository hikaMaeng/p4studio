import type { StudioDatabase } from "./client.js";

/** Adds clearly named preview records only when the explicit demo flag is enabled. */
export const seedDemo = (database: StudioDatabase) => {
  if (database.agents().length > 0) return;
  const local = database.createAgent({ name: "workstation-a", host: "127.0.0.1", port: 52211 });
  const remote = database.createAgent({ name: "compute-b", host: "192.168.0.42", port: 52212 });
  const model = database.createModel({ name: "Gemma 4 12B", artifact: "S:/models/gemma-4-12b-it.gguf", architecture: "gemma4", adapter: "llamacpp", contextLength: 32768, notes: "데모 레코드" });
  const a = database.createNode({ agentId: local.id, name: "stage-a", adapter: "llamacpp" });
  const b = database.createNode({ agentId: remote.id, name: "stage-b", adapter: "llamacpp" });
  database.createPipeline({ name: "gemma-4-two-stage", modelId: model.id, stages: [
    { nodeId: a.id, stageIndex: 0, layerStart: 0, layerEnd: 18, launchArgs: "{}" },
    { nodeId: b.id, stageIndex: 1, layerStart: 18, layerEnd: 36, launchArgs: "{}" },
  ] });
};
