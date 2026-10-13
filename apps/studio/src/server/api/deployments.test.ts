import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { deployments, emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import type { DeploymentInput } from "@p4studio/studio_domain/common";
import { createApp } from "../app.js";
import { StudioDatabase } from "../database/client.js";
import { deploymentPresets, buildLoadPayload } from "@p4studio/studio_domain/common";

const databases: StudioDatabase[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));

it("SQLite의 옛 binary 선언은 원본 변경 없이 읽고 편집·저장·이력을 복원한다", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const agent = database.createAgent({ name: "옛 배치 시험", host: "127.0.0.1", port: 51055 });
  const app = createApp(database), source = deploymentPresets[0]!.stages[0]!;
  const input = { ...emptyDeployment(), name: "옛 배치", totalLayers: source.layerEnd,
    stages: [{ ...emptyStage(), ...source, agentId: agent.id, nodeId: "legacy-node" }] };
  const created = await request(app).post("/api/model-deployments").send(input).expect(201);
  const old = structuredClone(created.body);
  old.stages[0].binary = "C:\\old\\server.exe";
  old.stages[0].loadOptionsJson = JSON.stringify({ ...JSON.parse(source.loadOptionsJson), binary: "C:\\stale\\server.exe", future_option: 7 });
  const original = JSON.stringify(old);
  database.connection.prepare("UPDATE model_deployments SET document=? WHERE id=?").run(original, old.id);
  const listed = await request(app).get("/api/model-deployments").expect(200);
  const read = listed.body.deployments[0];
  expect(read.stages[0]).not.toHaveProperty("binary");
  expect(JSON.parse(read.stages[0].loadOptionsJson)).not.toHaveProperty("binary");
  expect(database.connection.prepare("SELECT document FROM model_deployments WHERE id=?").get(old.id)!.document).toBe(original);
  deployments.open(read);
  const draft = deployments.editor.value.input;
  deployments.updateStage(draft.stages[0]!.id, "nodeId", "edited-node");
  expect(buildLoadPayload(draft, draft.stages[0]!, 11)).not.toHaveProperty("binary");
  const saved = await request(app).put(`/api/model-deployments/${old.id}`).send(draft).expect(200);
  expect(saved.body.stages[0].nodeId).toBe("edited-node");
  expect(JSON.parse(saved.body.stages[0].loadOptionsJson)).toMatchObject({ future_option: 7 });
  expect(JSON.parse(saved.body.stages[0].loadOptionsJson)).not.toHaveProperty("binary");
  const reread = await request(app).get("/api/model-deployments").expect(200);
  expect(reread.body.deployments[0]).toEqual(saved.body);
  const history = await request(app).get(`/api/model-deployments/${old.id}/history`).expect(200);
  expect(JSON.stringify(history.body)).not.toContain("stale");
});

it("인사이트 노트는 HTTP·SQLite·편집에 보존하고 필드 없는 과거 선언도 허용한다", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const agent = database.createAgent({ name: "근거 시험", host: "127.0.0.1", port: 51055 });
  const app = createApp(database);
  const input = { ...emptyDeployment(), name: "실측 구성", stages: [{ ...emptyStage(), agentId: agent.id, nodeId: "new-node", artifact: "fixture.gguf", endpoint: "127.0.0.1:52001", layerStart: 0, layerEnd: 1 }] };
  const old = await request(app).post("/api/model-deployments").send(input).expect(201);
  expect(old.body.insightNotes).toBeUndefined();
  const insightNotes = "실측5/5 · source/run · useful TPS의 분모를 보존";
  await request(app).put(`/api/model-deployments/${old.body.id}`).send({ ...input, insightNotes }).expect(200);
  const listed = await request(app).get("/api/model-deployments").expect(200);
  expect(listed.body.deployments[0].insightNotes).toBe(insightNotes);
});

it("stores declarations and browser receipts but rejects server-side P4 execution", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const agent = database.createAgent({ name: "ingress", host: "127.0.0.1", port: 51055 });
  const app = createApp(database);
  const input: DeploymentInput = { ...emptyDeployment(), name: "distributed", ingressAgentId: agent.id, totalLayers: 1,
    stages: [{ ...emptyStage(), id: "stage-1", agentId: agent.id, nodeId: "node-1", artifact: "S:\\models\\model.gguf", endpoint: "127.0.0.1:52001", layerStart: 0, layerEnd: 1 }] };
  const created = await request(app).post("/api/model-deployments").send(input).expect(201);
  await request(app).post(`/api/model-deployments/${created.body.id}/load`).expect(409);
  const receipt = { expectedUpdatedAt: created.body.updatedAt, status: "unknown", loadGeneration: 42, operationId: crypto.randomUUID(), error: "Browser closed after submission", reports: [{ stageId: "stage-1", state: "unknown", detail: "No reply", failureDetail: "No reply", loadRequested: true, telemetry: null, updatedAt: new Date().toISOString() }], resolvedAddresses: { [agent.id]: "tcp://127.0.0.1:51055" } };
  const stored = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send(receipt).expect(200);
  expect(stored.body).toMatchObject({ status: receipt.status, loadGeneration: receipt.loadGeneration, operationId: receipt.operationId });
  await request(app).delete(`/api/model-deployments/${created.body.id}`).expect(409);
  await request(app).put(`/api/model-deployments/${created.body.id}`).send(input).expect(409);
  const advanced = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, expectedUpdatedAt: stored.body.updatedAt, stageGenerations: { "stage-1": 1234 } }).expect(200);
  expect(advanced.body.stages[0].nodeGeneration).toBe(1234);
  await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, expectedUpdatedAt: advanced.body.updatedAt, stageGenerations: { "stage-1": 1233 } }).expect(409);
  await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, expectedUpdatedAt: advanced.body.updatedAt, stageGenerations: { other: 1234 } }).expect(409);
  const observed = { status: "unloaded", loadGeneration: receipt.loadGeneration, operationId: receipt.operationId, error: receipt.error,
    reports: receipt.reports.map(report => ({ ...report, state: "unloaded", resourceState: "absent",
      lifecycle: { operation: "unload", status: "succeeded", resourceState: "absent", firstError: null, cleanupError: null },
      observation: { state: "missing", checkedAt: new Date().toISOString(), agentGeneratedAt: 123, detail: "" } })), resolvedAddresses: receipt.resolvedAddresses };
  await request(app).put(`/api/model-deployments/${created.body.id}/reconcile`).send({ ...observed, expectedUpdatedAt: "old-revision" }).expect(409);
  const reconciled = await request(app).put(`/api/model-deployments/${created.body.id}/reconcile`).send({ ...observed, expectedUpdatedAt: advanced.body.updatedAt }).expect(200);
  expect(reconciled.body).toMatchObject(observed);
  const listed = await request(app).get("/api/model-deployments").expect(200);
  expect(listed.body.deployments[0]).toMatchObject(observed);
  expect(listed.body.deployments[0].stages[0].nodeGeneration).toBe(1234);
  await request(app).put(`/api/model-deployments/${created.body.id}`).send(input).expect(200);
  await request(app).delete(`/api/model-deployments/${created.body.id}`).expect(204);
  await request(app).get("/api/model-deployments").expect({ deployments: [] });
});
