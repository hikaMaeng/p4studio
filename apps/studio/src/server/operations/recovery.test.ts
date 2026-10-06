import { expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";
import { StudioDatabase } from "../database/client.js";
import { DeploymentRepository } from "../database/deployments.js";
import { emptyDeployment, emptyStage } from "@p4studio/studio_domain/front";
import { AgentRecovery, createRecoveryRouter } from "./recovery.js";
import { OperationLeases } from "./leases.js";
import type { HostProof } from "../../common/recovery.js";
import type { ManagementProfile, WindowsHostManager } from "./windows.js";
function fixture() {
  const db = new StudioDatabase(":memory:"), agent = db.createAgent({ name: "TUF fixture", host: "tuf", port: 52000 }), leases = new OperationLeases(db.connection), models = new DeploymentRepository(db.connection);
  const model = models.create({ ...emptyDeployment(), name: "Recovery fixture", stages: [{ ...emptyStage(), agentId: agent.id, id: "stage", nodeId: "node" }] });
  model.loadGeneration = 42; model.status = "unknown"; model.error = "original unload is busy"; model.reports = [{ stageId: "stage", state: "unknown", loadOutcome: "succeeded", resourceState: "present", loadRequested: true, detail: "busy", failureDetail: "original inference failure", telemetry: null, updatedAt: "now", lifecycle: { operation: "unload", status: "rejected", resourceState: "present", firstError: "busy", cleanupError: null } }]; models.save(model);
  const proof = (pid: number): HostProof => ({ observedAt: new Date(Date.now()+60_000).toISOString(), agentPid: pid, agentBorn: `birth-${pid}`, agentHash: "a".repeat(64), nativeHash: "b".repeat(64), launchHash: "c".repeat(64), processes: [{ pid, parentPid: 1, born: `birth-${pid}`, path: "agent", command: "approved" }], ports: [52000], gpu: [], freeRamKiB: 1000 });
  let current = proof(10);
  const host = { inspect: vi.fn<WindowsHostManager["inspect"]>(async () => structuredClone(current)), recover: vi.fn<WindowsHostManager["recover"]>(async (_profile, _id, _before, progress) => { progress("starting", true); current = proof(20); return structuredClone(current); }), resume: vi.fn<WindowsHostManager["resume"]>(async () => { current = proof(30); return structuredClone(current); }) };
  const profile: ManagementProfile = { agentId: agent.id, host: "tuf", port: 52000, sshHost: "tuf", sshPort: 22, sshUser: "admin", root: "C:\\agent", task: "P4", agentHash: "a".repeat(64), nativeHash: "b".repeat(64), launchHash: "c".repeat(64), identityName: "management_identity" };
  const recovery = new AgentRecovery(db, leases, [profile], host);
  return { db, agent, leases, models, model, host, recovery, profile };
}
async function idle() { for (let n = 0; n < 4; n++) await new Promise(resolve => setTimeout(resolve, 0)); }
it("keeps forced reset distinct from rejected UNLOAD, fences until fresh P4 proof, and never repeats execution", async () => {
  const f = fixture(); try {
    const plan = await f.recovery.plan(f.agent.id, crypto.randomUUID()); f.recovery.execute(plan.id); f.recovery.execute(plan.id); await idle();
    expect(f.host.recover).toHaveBeenCalledTimes(1); expect(f.recovery.get(plan.id).state).toBe("verifying");
    expect(() => f.leases.acquire(crypto.randomUUID(), f.leases.modelResources(f.model), "load")).toThrow();
    await expect(f.recovery.verify(plan.id, { observedAt: new Date().toISOString(), agentPid: 10, agentBorn: "birth-10", nodes: 0 })).rejects.toThrow("stale");
    const after = f.recovery.get(plan.id).after!;
    await f.recovery.verify(plan.id, { observedAt: new Date().toISOString(), agentPid: after.agentPid, agentBorn: after.agentBorn, nodes: 0 });
    const saved = f.models.get(f.model.id)!; expect(saved.status).toBe("absent"); expect(saved.error).toBe("original unload is busy");
    expect(saved.reports[0]).toMatchObject({ recovery: { kind: "forced", operationId: plan.id }, lifecycle: { status: "rejected" }, failureDetail: "original inference failure", resourceState: "absent" });
    expect(f.models.history(saved.id).some(row => row.record.reports[0]?.lifecycle?.status === "rejected")).toBe(true);
    expect(() => f.leases.acquire(crypto.randomUUID(), f.leases.modelResources(saved), "load")).not.toThrow();
  } finally { f.db.close(); }
});
it("rejects changed affected model revisions and preserves partial stop when startup fails", async () => {
  const f = fixture(); try {
    const stale = await f.recovery.plan(f.agent.id, crypto.randomUUID()); const changed = f.models.get(f.model.id)!; changed.updatedAt += "changed"; f.models.save(changed);
    expect(() => f.recovery.execute(stale.id)).toThrow("changed"); expect(f.host.recover).not.toHaveBeenCalled();
    const plan = await f.recovery.plan(f.agent.id, crypto.randomUUID()); f.host.recover.mockImplementationOnce(async (_p, _id, _b, progress) => { progress("starting", true); throw new Error("startup failed"); });
    f.recovery.execute(plan.id); await idle(); expect(f.recovery.get(plan.id)).toMatchObject({ state: "unknown", stopped: true, firstError: "startup failed", after: null });
    await expect(f.recovery.cancel(plan.id)).rejects.toThrow("resource effects"); f.recovery.resume(plan.id); await idle(); expect(f.host.recover).toHaveBeenCalledTimes(1); expect(f.host.resume).toHaveBeenCalledTimes(1); expect(f.recovery.get(plan.id).state).toBe("verifying");
  } finally { f.db.close(); }
});
it("rejects CSRF and missing explicit-action header; reload reads the same operation without host mutation", async () => {
  const f = fixture(); try {
    const app = express(); app.use(express.json()); app.use(createRecoveryRouter(f.recovery)); const id = crypto.randomUUID();
    await request(app).post(`/api/agent-recovery/agents/${f.agent.id}/plan`).send({ operationId: id }).expect(403);
    await request(app).post(`/api/agent-recovery/agents/${f.agent.id}/plan`).set("Origin", "https://other.invalid").set("X-P4Studio-Action", "recovery").send({ operationId: id }).expect(403);
    await request(app).post(`/api/agent-recovery/agents/${f.agent.id}/plan`).set("X-P4Studio-Action", "recovery").send({ operationId: id }).expect(201);
    const restarted = new AgentRecovery(f.db, f.leases, [f.profile], f.host); expect(restarted.get(id).state).toBe("prepared"); expect(f.host.recover).not.toHaveBeenCalled();
  } finally { f.db.close(); }
});
it("reviews the remaining tree after partial failure, preserves the first failure and continues once under the same fence", async () => {
  const f = fixture(); try {
    const plan = await f.recovery.plan(f.agent.id, crypto.randomUUID());
    f.host.recover.mockImplementationOnce(async () => { throw new Error("one native process stopped, another stop failed"); });
    f.recovery.execute(plan.id); await idle();
    expect(() => f.recovery.retry(plan.id, crypto.randomUUID())).toThrow("Review");
    const partial = { ...plan.before, processes: plan.before.processes.slice(0, 1), ports: [52000] };
    f.host.inspect.mockResolvedValueOnce(partial);
    const reviewed = await f.recovery.reviewRetry(plan.id), attempt = reviewed.retry!;
    expect(() => f.leases.acquire(crypto.randomUUID(), f.leases.modelResources(f.model), "load")).toThrow();
    f.recovery.retry(plan.id, attempt.id);
    expect(() => f.recovery.retry(plan.id, attempt.id)).toThrow("Review"); await idle();
    expect(f.host.recover).toHaveBeenLastCalledWith(f.profile, attempt.id, partial, expect.any(Function));
    expect(f.recovery.get(plan.id)).toMatchObject({ state: "verifying", firstError: "one native process stopped, another stop failed", retry: null, attempts: [{ id: attempt.id, before: partial }] });
  } finally { f.db.close(); }
});
it("fences models forwarded through the recovered gateway without marking remote stages absent", async () => {
  const f = fixture(); try {
    const remote = f.db.createAgent({ name: "remote", host: "remote", port: 52000 });
    f.db.agentGroups.save({ name: "forwarding", gatewayAgentId: f.agent.id, memberAgentIds: [f.agent.id, remote.id] });
    const model = f.models.create({ ...emptyDeployment(), name: "Forwarded model", stages: [{ ...emptyStage(), agentId: remote.id, id: "remote-stage", nodeId: "remote-node" }] });
    model.loadGeneration = 99; model.status = "loaded"; model.reports = [{ stageId: "remote-stage", state: "loaded", loadRequested: true, loadOutcome: "succeeded", resourceState: "present", detail: "", failureDetail: "", telemetry: null, updatedAt: "now" }]; f.models.save(model);
    const plan = await f.recovery.plan(f.agent.id, crypto.randomUUID()); expect(plan.affected.find(value => value.modelId === model.id)?.stageIds).toEqual([]);
    f.recovery.execute(plan.id); await idle(); expect(() => f.leases.acquire(crypto.randomUUID(), f.leases.modelResources(model), "inference")).toThrow();
    const after = f.recovery.get(plan.id).after!; await f.recovery.verify(plan.id, { observedAt: new Date().toISOString(), agentPid: after.agentPid, agentBorn: after.agentBorn, nodes: 0 });
    const saved = f.models.get(model.id)!; expect(saved.status).toBe("unknown"); expect(saved.reports[0]?.resourceState).toBe("present"); expect(saved.sessionProof).toBe(null);
  } finally { f.db.close(); }
});
