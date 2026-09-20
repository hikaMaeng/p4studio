import { resolve } from "node:path";
import { createServer } from "vite";
import { readEnv } from "./env/schema.js";
import { startRuntime } from "./runtime.js";

try { process.loadEnvFile(resolve(process.cwd(), "../../.env")); } catch { /* defaults remain valid */ }
// The development runtime must not share the production Compose port. Tunnels
// remain active in this process, but their local ports stay independent.
process.env.P4STUDIO_PORT = process.env.P4STUDIO_DEV_PORT ?? "43122";
startRuntime(readEnv());
const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.ts") });
await vite.listen();
vite.printUrls();
