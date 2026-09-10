import { z } from "zod";

const envSchema = z.object({
  P4STUDIO_PORT: z.coerce.number().int().min(10_000).max(59_999).default(43_120),
  P4STUDIO_SQLITE_PATH: z.string().min(1).default("data/p4studio.db"),
  P4STUDIO_PROBE_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(15_000),
  P4STUDIO_PROBE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
  P4STUDIO_AGENT_INSPECTION_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  P4STUDIO_SEED_DEMO: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type StudioEnv = z.infer<typeof envSchema>;

/** Validates all runtime configuration before the server opens a database or port. */
export const readEnv = (source: NodeJS.ProcessEnv = process.env): StudioEnv => envSchema.parse(source);
