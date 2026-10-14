import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import { createApp } from "../app.js";
import { StudioDatabase } from "../database/client.js";
afterEach(() => vi.useRealTimers());
it.each(["load", "unload"] as const)("실행 중인 %s 원장은 다른 창의 상태 조회가 바꾸지 않는다", async action => {
  const database = new StudioDatabase(":memory:");
  try {
    const app = createApp(database);
    const created = await request(app).post("/api/model-deployments").send({ ...emptyDeployment(), name: "상태 조회와 실행의 충돌 반례", stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head" }] }).expect(201);
    const operationId = "54ec6f05-5c8d-4d8b-832b-e28696dc8e90";
    await request(app).post("/api/operation-leases").send({ operationId, modelId: created.body.id, expectedUpdatedAt: created.body.updatedAt, action }).expect(200);
    const receipt = { expectedUpdatedAt: created.body.updatedAt, status: action === "load" ? "loading" : "unloading", loadGeneration: 42, operationId, error: "", reports: [], resolvedAddresses: {} };
    const current = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send(receipt).expect(200);
    await request(app).put(`/api/model-deployments/${created.body.id}/reconcile`).send({ ...current.body, expectedUpdatedAt: current.body.updatedAt, status: "unknown" }).expect(409);
    const list = await request(app).get("/api/model-deployments");
    expect(list.body.deployments[0].updatedAt).toBe(current.body.updatedAt);
    expect(list.body.deployments[0].status).toBe(receipt.status);
    await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, expectedUpdatedAt: current.body.updatedAt, status: action === "load" ? "loaded" : "unloaded" }).expect(200);
    await request(app).delete(`/api/operation-leases/${operationId}`).expect(204);
    const finished = (await request(app).get("/api/model-deployments")).body.deployments[0];
    await request(app).put(`/api/model-deployments/${created.body.id}/reconcile`).send({ ...finished, expectedUpdatedAt: finished.updatedAt }).expect(200);
  } finally { database.close(); }
});
it("AUD-11: two same-millisecond receipts with the same revision must not both succeed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-06T01:02:03.456Z"));
  const database = new StudioDatabase(":memory:");
  try {
    const app = createApp(database);
    const input = { ...emptyDeployment(), name: "Revision collision", stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head" }] };
    const created = await request(app).post("/api/model-deployments").send(input).expect(201);
    const receipt = { expectedUpdatedAt: created.body.updatedAt, status: "loading", loadGeneration: 42, operationId: "first-load", error: "", reports: [], resolvedAddresses: {} };
    await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send(receipt).expect(200);
    const second = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, operationId: "second-load" });
    expect(second.status).toBe(409);
  } finally { database.close(); }
});
it("rejects an old LOAD even with a new revision and binds legacy chronology to the new server-owned start", async () => {
  const database = new StudioDatabase(":memory:");
  try {
    const app = createApp(database), created = await request(app).post("/api/model-deployments").send({ ...emptyDeployment(), name: "Generation fence", stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head" }] }).expect(201);
    const receipt = { expectedUpdatedAt: created.body.updatedAt, status: "loading", loadGeneration: 42, operationId: "load", error: "", reports: [], resolvedAddresses: {} };
    const current = await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send(receipt).expect(200);
    expect(Number.isFinite(Date.parse(current.body.loadStartedAt))).toBe(true);
    await request(app).put(`/api/model-deployments/${created.body.id}/receipt`).send({ ...receipt, expectedUpdatedAt: current.body.updatedAt, loadGeneration: 41 }).expect(409);
    await request(app).put(`/api/model-deployments/${created.body.id}/reconcile`).send({ ...receipt, expectedUpdatedAt: current.body.updatedAt, loadGeneration: 43 }).expect(409);
    const list = await request(app).get("/api/model-deployments"); expect(list.body.deployments[0].loadGeneration).toBe(42); expect(list.body.deployments[0].loadStartedAt).toBe(current.body.loadStartedAt);
  } finally { database.close(); }
});
