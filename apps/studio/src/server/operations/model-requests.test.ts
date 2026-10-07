import { expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { StudioDatabase } from "../database/client.js";
import { DeploymentRepository } from "../database/deployments.js";
import { emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import { OperationLeases, createLeaseRouter } from "./leases.js";
function fixture() {
  const db = new StudioDatabase(":memory:"), repository = new DeploymentRepository(db.connection), leases = new OperationLeases(db.connection);
  const record = repository.create({ ...emptyDeployment(), name: "Pending owner", stages: ["head", "tail"].map(id => ({ ...emptyStage(), id, agentId: "agent", nodeId: id, nodeGeneration: 9 })) });
  record.loadGeneration = 42; record.status = "loaded"; repository.save(record);
  const operationId = crypto.randomUUID(), ownerToken = crypto.randomUUID(); leases.beginInference(operationId, record, ownerToken);
  const app = express(); app.use(express.json(), createLeaseRouter(db.connection, leases));
  const path = `/api/model-deployments/${record.id}/requests`;
  return { db, repository, leases, record, operationId, ownerToken, app, path };
}
it("exposes durable pending counts without cancellation capabilities, rejects stale or foreign checkpoints", async () => {
  const f = fixture(); try {
    const input = { ownerToken: f.ownerToken, loadGeneration: 42, admitted: 100, settled: 60, submitted: 100 };
    const checkpoint = `/api/operation-leases/${f.operationId}/checkpoint`;
    await request(f.app).put(checkpoint).send({ ...input, ownerToken: crypto.randomUUID() }).expect(409);
    await request(f.app).put(checkpoint).send({ ...input, loadGeneration: 43 }).expect(409);
    await request(f.app).put(checkpoint).send(input).expect(204);
    await request(f.app).put(checkpoint).send({ ...input, settled: 59 }).expect(409);
    await request(f.app).put(checkpoint).send({ ...input, settled: 101 }).expect(400);
    f.leases.release(f.operationId);
    const reply = await request(f.app).get(f.path).expect(200);
    expect(reply.body.owners).toMatchObject([{ pending: 40, submitted: 100, live: false }]);
    expect(JSON.stringify(reply.body)).not.toContain(f.ownerToken); expect(reply.body.owners[0]).not.toHaveProperty("tokenHash");
    expect(new OperationLeases(f.db.connection).requestOwners(f.record)[0]?.pending).toBe(40);
  } finally { f.db.close(); }
});
it("only clears under the model fence after fresh absence of every exact stage, preserving unknown results", async () => {
  const f = fixture(); try {
    f.leases.release(f.operationId);
    const id = crypto.randomUUID(), input = { operationId: id, loadGeneration: 42, expectedUpdatedAt: f.record.updatedAt };
    await request(f.app).post(`${f.path}/clear`).send(input).expect(403);
    const clear = (body = input) => request(f.app).post(`${f.path}/clear`).set("x-p4studio-action", "clear-model-requests").send(body);
    await clear().expect(409); // No UNLOAD fence.
    f.leases.acquire(id, f.leases.modelResources(f.record), "unload", "inference");
    await clear().expect(409); // No observations.
    const time = new Date().toISOString();
    f.record.reports = f.record.stages.map(stage => ({ stageId: stage.id, state: "absent", resourceState: "absent", loadOutcome: "succeeded", detail: "", failureDetail: "", loadRequested: true, telemetry: null, updatedAt: time, observation: { state: "missing", checkedAt: time, agentGeneratedAt: Date.now(), detail: "" } }));
    f.record.reports[1]!.observation!.state = "unknown"; f.repository.save(f.record); await clear().expect(409);
    f.record.reports[1]!.observation!.state = "missing"; f.record.reports[1]!.observation!.agentGeneratedAt = Date.now() - 60_000; f.repository.save(f.record); await clear().expect(409);
    f.record.reports[1]!.observation!.agentGeneratedAt = Date.now(); f.repository.save(f.record);
    f.record.reports[1]!.loadOutcome = "unknown"; f.repository.save(f.record); await clear().expect(409);
    f.record.reports[1]!.loadOutcome = "succeeded"; f.repository.save(f.record);
    await clear({ ...input, expectedUpdatedAt: "stale" }).expect(409);
    await clear({ ...input, loadGeneration: 43 }).expect(409);
    await request(f.app).post(`${f.path}/clear`).set("x-p4studio-action", "clear-model-requests").set("origin", "https://another.example").send(input).expect(403);
    await clear().expect(204); await clear().expect(204);
    expect(f.leases.requestOwners(f.record)).toEqual([]);
    expect(f.leases.inferenceOwners()[0]).toMatchObject({ settledAt: null, clearOperationId: id, clearedAt: expect.any(String) });
    f.leases.release(id);
    expect(() => f.leases.beginInference(f.operationId, f.record, f.ownerToken)).toThrow("cleared");
    expect(() => new OperationLeases(f.db.connection).beginInference(crypto.randomUUID(), f.record, crypto.randomUUID())).not.toThrow();
  } finally { f.db.close(); }
});
it("does not retire an alias owner that also owns another model's node", () => {
  const f = fixture(); try {
    f.leases.release(f.operationId);
    const alias = { ...f.record, id: "alias", stages: [...f.record.stages, { ...emptyStage(), id: "other", agentId: "agent", nodeId: "other", nodeGeneration: 9 }] };
    // Admit the alias after settling the first owner, then target only the original placement.
    f.leases.settleInference(f.operationId, 42, 0, f.ownerToken);
    const operation = crypto.randomUUID(); f.leases.beginInference(operation, alias, crypto.randomUUID()); f.leases.release(operation);
    const clear = crypto.randomUUID(); f.leases.acquire(clear, f.leases.modelResources(f.record), "unload");
    const time = new Date().toISOString(); f.record.reports = f.record.stages.map(stage => ({ stageId: stage.id, state: "absent", resourceState: "absent", loadOutcome: "succeeded", detail: "", failureDetail: "", loadRequested: true, telemetry: null, updatedAt: time, observation: { state: "missing", checkedAt: time, agentGeneratedAt: Date.now(), detail: "" } }));
    expect(() => f.leases.clearRequests(f.record, clear)).toThrow("outside this model");
    expect(f.leases.requestOwners(f.record)).toHaveLength(1);
  } finally { f.db.close(); }
});
