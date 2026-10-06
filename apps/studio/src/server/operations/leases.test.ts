import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { StudioDatabase } from "../database/client.js";
import { emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import { parseDeployment } from "@p4studio/studio_domain/common";
import { OperationLeases } from "./leases.js";
afterEach(() => vi.useRealTimers());
it("keeps the generation owner after connection release, TTL expiry, and server reconstruction", async () => {
  const db = new StudioDatabase(":memory:");
  try {
    const app = createApp(db), created = await request(app).post("/api/model-deployments").send({ ...emptyDeployment(), name: "Unknown owner", stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head" }] }).expect(201);
    const first = crypto.randomUUID(), next = crypto.randomUUID(), ownerToken = crypto.randomUUID(), input = { modelId: created.body.id, expectedUpdatedAt: created.body.updatedAt, action: "inference", ownerToken };
    await request(app).post("/api/operation-leases").send({ ...input, operationId: first }).expect(200);
    await request(app).delete(`/api/operation-leases/${first}`).expect(204);
    const blocked = await request(app).post("/api/operation-leases").send({ ...input, operationId: next }).expect(409);
    expect(blocked.body.error.message).toContain("settlement is unknown");
    const leases = new OperationLeases(db.connection);
    expect(leases.inferenceOwners()).toMatchObject([{ operationId: first, settledAt: null }]);
    expect(() => leases.beginInference(next, created.body, crypto.randomUUID())).toThrow("settlement is unknown");
    expect(() => leases.beginInference(first, created.body, ownerToken)).toThrow("original inference lease ended");
    await request(app).put(`/api/operation-leases/${first}/settlement`).send({ loadGeneration: created.body.loadGeneration, pendingSettlement: 0, submitted: 0 }).expect(400);
    await request(app).put(`/api/operation-leases/${first}/settlement`).send({ ownerToken: crypto.randomUUID(), loadGeneration: created.body.loadGeneration, pendingSettlement: 0, submitted: 0 }).expect(409);
    await request(app).post("/api/operation-leases").send({ ...input, ownerToken: crypto.randomUUID(), operationId: first }).expect(409);
    expect(leases.inferenceOwners()[0]?.settledAt).toBeNull();
    await request(app).put(`/api/operation-leases/${first}/settlement`).send({ ownerToken, loadGeneration: created.body.loadGeneration, pendingSettlement: 1, submitted: 1 }).expect(400);
    await request(app).put(`/api/operation-leases/${first}/settlement`).send({ ownerToken, loadGeneration: 999, pendingSettlement: 0, submitted: 1 }).expect(409);
    await request(app).put(`/api/operation-leases/${first}/settlement`).send({ ownerToken, loadGeneration: created.body.loadGeneration, pendingSettlement: 0, submitted: 1 }).expect(204);
    await request(app).post("/api/operation-leases").send({ ...input, operationId: next }).expect(200);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 60_000);
    expect(() => new OperationLeases(db.connection).beginInference(crypto.randomUUID(), created.body, crypto.randomUUID())).toThrow("settlement is unknown");
  } finally { db.close(); }
});
it("fences aliases of unresolved node generations, while preserving the old owner after a fresh LOAD", () => {
  const db = new StudioDatabase(":memory:"), leases = new OperationLeases(db.connection);
  try {
    const record = parseDeployment({ ...emptyDeployment(), id: "original", name: "Generation owner", status: "loaded", reports: [], resolvedAddresses: {}, error: "", operationId: "load", createdAt: "now", updatedAt: "now", loadGeneration: 42, stages: [{ ...emptyStage(), id: "head", agentId: "agent", nodeId: "head", nodeGeneration: 9 }] });
    const id = crypto.randomUUID(); leases.beginInference(id, record, crypto.randomUUID()); leases.release(id);
    expect(() => leases.beginInference(crypto.randomUUID(), { ...record, id: "alias" }, crypto.randomUUID())).toThrow("settlement is unknown");
    leases.beginInference(crypto.randomUUID(), { ...record, loadGeneration: 43, stages: [{ ...record.stages[0]!, nodeGeneration: 10 }] }, crypto.randomUUID());
    expect(leases.inferenceOwners().find(owner => owner.operationId === id)?.settledAt).toBeNull();
  } finally { db.close(); }
});
it("rejects a second SESSION owner, hands UNLOAD off after revocation, and never preempts another UNLOAD", async () => {
  const db = new StudioDatabase(":memory:");
  try {
    const app = createApp(db), created = await request(app).post("/api/model-deployments").send({ ...emptyDeployment(), name: "Lease integration" }).expect(201);
    const first = crypto.randomUUID(), unload = crypto.randomUUID(), other = crypto.randomUUID();
    const input = { modelId: created.body.id, expectedUpdatedAt: created.body.updatedAt, ownerToken: crypto.randomUUID() };
    await request(app).post("/api/operation-leases").send({ ...input, operationId: first, action: "inference" }).expect(200);
    await request(app).post("/api/operation-leases").send({ ...input, operationId: other, action: "inference" }).expect(409);
    const pending = await request(app).post("/api/operation-leases").send({ ...input, operationId: unload, action: "unload" }).expect(200); expect(pending.body.ready).toBe(false);
    await request(app).put(`/api/operation-leases/${first}`).expect(409);
    await request(app).post("/api/operation-leases").send({ ...input, operationId: other, action: "unload" }).expect(409);
    await request(app).delete(`/api/operation-leases/${first}`).expect(204);
    expect((await request(app).get(`/api/operation-leases/${unload}`).expect(200)).body.ready).toBe(true);
  } finally { db.close(); }
});
it("rejects a stale model revision before admitting any lease", async () => {
  const db = new StudioDatabase(":memory:");
  try {
    const app = createApp(db), created = await request(app).post("/api/model-deployments").send({ ...emptyDeployment(), name: "Stale lease" }).expect(201);
    await request(app).post("/api/operation-leases").send({ modelId: created.body.id, expectedUpdatedAt: "old", operationId: crypto.randomUUID(), action: "load" }).expect(409);
  } finally { db.close(); }
});
it("keeps recovery exclusive even for another recovery and rejects operation-kind reuse", () => {
  const db = new StudioDatabase(":memory:"), leases = new OperationLeases(db.connection);
  try {
    const id = crypto.randomUUID(), resources = leases.agentResources("agent"); leases.acquire(id, resources, "recovery", "all");
    expect(() => leases.acquire(crypto.randomUUID(), resources, "recovery", "all")).toThrow("unresolved");
    expect(() => leases.acquire(id, resources, "load")).toThrow("identity");
    expect(leases.status(id).ready).toBe(true);
  } finally { db.close(); }
});
