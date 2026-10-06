import { z } from "zod";
import type { DeploymentRecord } from "@p4studio/studio_domain/common";
const proof = z.object({ operationId: z.string(), expiresAt: z.number(), ready: z.boolean() });
async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(path, { method, signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 204) return;
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? `HTTP ${response.status}`);
  return proof.parse(value);
}
/** Cross-tab management fence; P4 still owns its native lifecycle and exact generation checks. */
export async function acquireOperationLease(record: DeploymentRecord, operationId: string, action: "load" | "unload" | "inference", onLost: (error: Error) => void) {
  let active = true, renewing = false;
  // Private to this original execution closure; never stored in run history or returned by an API.
  const ownerToken = action === "inference" ? crypto.randomUUID() : undefined;
  let result = await request("/api/operation-leases", "POST", { operationId, modelId: record.id, expectedUpdatedAt: record.updatedAt, action, ...(ownerToken ? { ownerToken } : {}) });
  const timer = window.setInterval(() => {
    if (!active || renewing) return; renewing = true;
    void request(`/api/operation-leases/${encodeURIComponent(operationId)}`, "PUT").catch(error => { if (active) { active = false; onLost(error instanceof Error ? error : new Error(String(error))); } }).finally(() => { renewing = false; });
  }, 5000);
  const release = async () => { active = false; window.clearInterval(timer); await request(`/api/operation-leases/${encodeURIComponent(operationId)}`, "DELETE"); };
  try {
    const deadline = Date.now() + 35_000;
    while (!result?.ready) {
      if (!active || Date.now() >= deadline) throw new Error("Previous Studio owners did not release their operation leases before the deadline");
      await new Promise(resolve => window.setTimeout(resolve, 250));
      result = await request(`/api/operation-leases/${encodeURIComponent(operationId)}`, "GET");
    }
    return { release, settle: async (submitted: number) => {
      if (action !== "inference") throw new Error("Only the original inference owner can record request settlement");
      await request(`/api/operation-leases/${encodeURIComponent(operationId)}/settlement`, "PUT", { ownerToken, loadGeneration: record.loadGeneration, pendingSettlement: 0, submitted });
    } };
  } catch (error) { await release(); throw error; }
}
