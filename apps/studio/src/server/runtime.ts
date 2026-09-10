import { createApp } from "./app.js";
import { startAgentMonitor } from "./agent-socket/monitor.js";
import { inspectAgent } from "./agent-socket/inspection/client.js";
import { AgentObservationStore } from "./agent-socket/inspection/store.js";
import { StudioDatabase } from "./database/client.js";
import { seedDemo } from "./database/seed.js";
import type { StudioEnv } from "./env/schema.js";

/** Starts the API, persistence, and non-relaying agent reachability monitor. */
export const startRuntime = (env: StudioEnv) => {
  const database = new StudioDatabase(env.P4STUDIO_SQLITE_PATH);
  const observations = new AgentObservationStore();
  if (env.P4STUDIO_SEED_DEMO) seedDemo(database);
  const app = createApp(database, env.P4STUDIO_PROBE_TIMEOUT_MS, observations, inspectAgent);
  const server = app.listen(env.P4STUDIO_PORT, "0.0.0.0", () => {
    console.log(`p4studio status=ready port=${env.P4STUDIO_PORT} database=${env.P4STUDIO_SQLITE_PATH}`);
  });
  const stopMonitor = startAgentMonitor(
    database,
    observations,
    inspectAgent,
    env.P4STUDIO_PROBE_INTERVAL_MS,
    env.P4STUDIO_PROBE_TIMEOUT_MS,
    env.P4STUDIO_AGENT_INSPECTION_CONCURRENCY,
  );
  const stop = () => {
    stopMonitor();
    server.close(() => { database.close(); process.exit(0); });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { server, database };
};
