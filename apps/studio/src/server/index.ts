import { readEnv } from "./env/schema.js";
import { startRuntime } from "./runtime.js";

startRuntime(readEnv());
