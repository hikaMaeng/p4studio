import { z } from "zod";

const tunnelSchema = z.object({
  agentHost: z.string().min(1), agentPort: z.number().int().min(1).max(65535),
  sshHost: z.string().regex(/^[\w.-]+$/), sshPort: z.number().int().min(1).max(65535),
  sshUser: z.string().regex(/^[\w.-]+$/), localPort: z.number().int().min(1024).max(65535),
});
const tunnelsSchema = z.array(tunnelSchema).max(16).refine(items => new Set(items.map(i => i.localPort)).size === items.length, 'Duplicate tunnel port');

const envSchema = z.object({
  P4STUDIO_PORT: z.coerce.number().int().min(10_000).max(59_999).default(43_120),
  P4STUDIO_SQLITE_PATH: z.string().min(1).default("data/p4studio.db"),
  P4STUDIO_PROBE_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(15_000),
  P4STUDIO_PROBE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
  P4STUDIO_AGENT_INSPECTION_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  P4STUDIO_SEED_DEMO: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  P4STUDIO_AGENT_TUNNELS: z.string().default("[]").transform((value, context) => {
    try { return tunnelsSchema.parse(JSON.parse(value)); }
    catch { context.addIssue({ code: "custom", message: "Invalid P4STUDIO_AGENT_TUNNELS JSON" }); return z.NEVER; }
  }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type StudioEnv = z.infer<typeof envSchema>;

/** Validates all runtime configuration before the server opens a database or port. */
export const readEnv = (source: NodeJS.ProcessEnv = process.env): StudioEnv => envSchema.parse(source);
