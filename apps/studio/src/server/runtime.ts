import { createApp } from "./app.js";
import { StudioDatabase } from "./database/client.js";
import { seedDemo } from "./database/seed.js";
import type { StudioEnv } from "./env/schema.js";
import { startAgentTunnels } from "./agent-socket/tunnels.js";
import { attachBrowserP4Bridge } from "./agent-socket/browser-bridge.js";

/** Starts persistence plus the opaque browser-to-P4 bridge. */
export const startRuntime = (env: StudioEnv) => {
  const stopTunnels = startAgentTunnels(env.P4STUDIO_AGENT_TUNNELS);
  const database = new StudioDatabase(env.P4STUDIO_SQLITE_PATH);
  if (env.P4STUDIO_SEED_DEMO) seedDemo(database);
  const app = createApp(database);
  const server = app.listen(env.P4STUDIO_PORT, "0.0.0.0", () => {
    console.log(`p4studio status=ready port=${env.P4STUDIO_PORT} database=${env.P4STUDIO_SQLITE_PATH}`);
  });
  const stopBridge = attachBrowserP4Bridge(server, database);
  const stop = () => {
    stopBridge();
    stopTunnels();
    server.close(() => { database.close(); process.exit(0); });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { server, database };
};
