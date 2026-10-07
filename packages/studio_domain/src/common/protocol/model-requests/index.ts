import { z } from "zod";

/** Public owner metadata never includes the original browser's cancellation capability. */
export const modelRequestOwnerSchema = z.object({
  operationId: z.string(), modelId: z.string(), loadGeneration: z.number().int().nonnegative(),
  startedAt: z.string(), live: z.boolean(), submitted: z.number().int().nonnegative().nullable(),
  pending: z.number().int().nonnegative().nullable(), checkpointAt: z.string().nullable(),
}).strict();
export const modelRequestOwnersSchema = z.object({ owners: z.array(modelRequestOwnerSchema), observedAt: z.string().datetime() }).strict();
export type ModelRequestOwner = z.infer<typeof modelRequestOwnerSchema>;
export const modelRequestsClearSchema = z.object({
  operationId: z.string().uuid(), loadGeneration: z.number().int().nonnegative(), expectedUpdatedAt: z.string().min(1),
}).strict();
export const modelRequestCheckpointSchema = z.object({
  ownerToken: z.string().uuid(), loadGeneration: z.number().int().nonnegative(),
  admitted: z.number().int().nonnegative(), settled: z.number().int().nonnegative(), submitted: z.number().int().nonnegative(),
}).strict().refine(value => value.settled <= value.admitted && value.submitted <= value.admitted, "Invalid request ownership checkpoint");

export type StageRequestWork = {
  stageId: string; nodeId: string; observedAt: string; state: "absent" | "observed" | "unknown";
  requests: number | null; pending: number | null; activeOwners: number | null; flights: number | null;
  detail: string;
};
export const modelRequestRoutes = {
  owners: { method: "GET", path: "/api/model-deployments/:id/requests" },
  clear: { method: "POST", path: "/api/model-deployments/:id/requests/clear" },
  checkpoint: { method: "PUT", path: "/api/operation-leases/:id/checkpoint" },
} as const;
