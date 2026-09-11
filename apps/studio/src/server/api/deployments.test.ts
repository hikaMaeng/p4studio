import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import type { DeploymentInput } from "@p4studio/studio_domain/common";
import { createApp } from "../app.js";
import { StudioDatabase } from "../database/client.js";

const databases: StudioDatabase[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));

it("stores declarations and browser receipts but rejects server-side P4 execution", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const agent = database.createAgent({ name: "ingress", host: "127.0.0.1", port: 51055 });
  const app = createApp(database);
  const input: DeploymentInput = { ...emptyDeployment(), name: "distributed", ingressAgentId: agent.id, totalLayers: 1,
    stages: [{ ...emptyStage(), id: "stage-1", agentId: agent.id, nodeId: "node-1", artifact: "S:\\models\\model.gguf", binary: "stage-server", endpoint: "127.0.0.1:52001", layerStart: 0, layerEnd: 1 }] };
  const created = await request(app).post("/api/model-deployments").send(input).expect(201);
  await request(app).post(`/api/model-deployments/${created.body.id}/load`).expect(409);
  const receipt = { status: "unknown", loadGeneration: 42, operationId: crypto.randomUUID(), error: "Browser closed after submission", reports: [{ stageId: "stage-1", state: "unknown", detail: "No reply", failureDetail: "No reply", loadRequested: true, telemetry: null, updatedAt: new Date().toISOString() }], resolvedAddresses: { [agent.id]: "tcp://127.0.0.1:51055" } };
  const stored = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send(receipt).expect(200);
  expect(stored.body).toMatchObject(receipt);
  await request(app).put(`/api/model-deployments/${created.body.id}`).send(input).expect(200);
});
