import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { StudioDatabase } from "../database/client.js";

const databases: StudioDatabase[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));

it("기록 모델 등록 capability를 읽기 전용으로 공개한다", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const response = await request(createApp(database)).get("/api/capabilities").expect(200);
  expect(response.body).toEqual({ contractVersion: 1, recordedModelRegistration: {
    deploymentInsightNotes: true, catalogNotesPreserved: true,
    endpoints: ["GET /api/snapshot", "GET /api/model-deployments", "POST /api/agents", "POST /api/model-deployments", "POST /api/models"],
  } });
});

it("모델 카탈로그의 등록 notes를 snapshot 조회까지 그대로 보존한다", async () => {
  const database = new StudioDatabase(":memory:"); databases.push(database);
  const app = createApp(database);
  const notes = JSON.stringify({ insightNotes: "fixture notes", source: "fixture" });
  await request(app).post("/api/models").send({ name: "기록 모델", artifact: "fixture.gguf", architecture: "recorded",
    adapter: "llamacpp", contextLength: 128, notes }).expect(201);
  const snapshot = await request(app).get("/api/snapshot").expect(200);
  expect(snapshot.body.models[0].notes).toBe(notes);
});
