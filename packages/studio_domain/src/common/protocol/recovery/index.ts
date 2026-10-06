import { z } from "zod";

const processSchema = z.object({ pid: z.number().int().positive(), parentPid: z.number().int().nonnegative(), born: z.string(), path: z.string(), command: z.string() });
export const hostProofSchema = z.object({
  observedAt: z.string(), agentPid: z.number().int().nonnegative(), agentBorn: z.string(),
  agentHash: z.string(), nativeHash: z.string(), launchHash: z.string(),
  processes: z.array(processSchema), ports: z.array(z.number().int().positive()),
  gpu: z.array(z.string()), freeRamKiB: z.number().nonnegative(), evidence: z.string().optional(),
});
export type HostProof = z.infer<typeof hostProofSchema>;
export const recoveryOperationSchema = z.object({
  id: z.string().uuid(), agentId: z.string(), agentName: z.string(), address: z.string(), createdAt: z.string(), updatedAt: z.string(),
  state: z.enum(["prepared", "stopping", "starting", "verifying", "recovered", "failed", "unknown"]),
  affected: z.array(z.object({ modelId: z.string(), modelName: z.string(), revision: z.string(), loadGeneration: z.number(), stageIds: z.array(z.string()) })),
  before: hostProofSchema, after: hostProofSchema.nullable(), firstError: z.string().nullable(), cleanupError: z.string().nullable(),
  stopped: z.boolean(), inspectedAt: z.string().nullable(),
  hostConfirmedAt: z.string().nullable().default(null),
  retry: z.object({ id: z.string().uuid(), reviewedAt: z.string().datetime(), before: hostProofSchema }).nullable().default(null),
  attempts: z.array(z.object({ id: z.string().uuid(), before: hostProofSchema, startedAt: z.string().datetime(), error: z.string().nullable() })).default([]),
});
export type RecoveryOperation = z.infer<typeof recoveryOperationSchema>;
export const recoveryListSchema = z.object({ configured: z.boolean(), operations: z.array(recoveryOperationSchema) });
