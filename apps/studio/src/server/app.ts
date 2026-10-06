import express from "express";
import { hostname } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { StudioDatabase } from "./database/client.js";
import { createApiRouter } from "./api/router.js";
import { AgentObservationStore } from "./agent-socket/inspection/store.js";
import { createDeploymentRouter } from "./api/deployments.js";
import { OperationLeases, createLeaseRouter } from "./operations/leases.js";
import { AgentRecovery, createRecoveryRouter } from "./operations/recovery.js";
import type { ManagementProfile } from "./operations/windows.js";

export const createApp = (
  database: StudioDatabase,
  observations = new AgentObservationStore(),
  profiles: ManagementProfile[] = [],
) => {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.json({ status: "ok", database: "ready", instance: hostname() }));
  app.use(createDeploymentRouter(database));
  const leases = new OperationLeases(database.connection);
  app.use(createLeaseRouter(database.connection, leases));
  app.use(createRecoveryRouter(new AgentRecovery(database, leases, profiles)));
  app.use("/api", createApiRouter(database, observations));

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
