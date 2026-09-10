import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { StudioDatabase } from "./database/client.js";
import { createApiRouter } from "./api/router.js";
import { inspectAgent } from "./agent-socket/inspection/client.js";
import { AgentObservationStore } from "./agent-socket/inspection/store.js";
import type { AgentInspector } from "./agent-socket/inspection/types.js";

export const createApp = (
  database: StudioDatabase,
  probeTimeoutMs: number,
  observations = new AgentObservationStore(),
  inspector: AgentInspector = inspectAgent,
) => {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.json({ status: "ok", database: "ready" }));
  app.use("/api", createApiRouter(database, observations, inspector, probeTimeoutMs));

  const front = join(dirname(resolve(process.argv[1] ?? ".")), "..", "front");
  if (existsSync(front)) {
    app.use(express.static(front, { index: false }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
      return response.sendFile(join(front, "index.html"));
    });
  }

  app.use((_request, response) => response.status(404).json({ error: { code: "not_found", message: "경로를 찾을 수 없습니다." } }));
  return app;
};
