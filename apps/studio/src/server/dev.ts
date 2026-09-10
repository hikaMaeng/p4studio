import { resolve } from "node:path";
import { createServer } from "vite";
import { readEnv } from "./env/schema.js";
import { startRuntime } from "./runtime.js";

try { process.loadEnvFile(resolve(process.cwd(), "../../.env")); } catch { /* defaults remain valid */ }
startRuntime(readEnv());
const vite = await createServer({ configFile: resolve(process.cwd(), "vite.config.ts") });
await vite.listen();
vite.printUrls();
