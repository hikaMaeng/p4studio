import { describe, expect, it } from "vitest";
import { inferenceRunSchema } from "./index.js";

const legacyRun = {
  id: "run", modelId: "model", modelName: "Model", state: "completed" as const,
  submitted: 2, completed: 2, createdAt: "2026-10-04T00:00:00.000Z", error: null,
  telemetrySeries: { version: 1 as const, output: [], batches: [], spans: [] }, requests: [],
};

describe("inference run settings", () => {
  it("keeps previously stored records readable when run settings are absent", () => {
    expect(inferenceRunSchema.parse(legacyRun).settings).toBeUndefined();
  });

  it("preserves the concurrency and repetition configuration on new records", () => {
    expect(inferenceRunSchema.parse({ ...legacyRun, settings: { concurrency: 10, repetitions: 10, intervalMs: 5000, maxTokens: 4000 } }).settings)
      .toEqual({ concurrency: 10, repetitions: 10, intervalMs: 5000, maxTokens: 4000 });
  });
});
