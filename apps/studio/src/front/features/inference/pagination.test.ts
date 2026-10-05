import { describe, expect, it } from "vitest";
import { INFERENCE_RESULTS_PAGE_SIZE, paginateResults } from "./pagination.js";
import { groupInferenceWaves } from "@p4studio/studio_domain/front";
import { parseInferenceRun } from "@p4studio/studio_domain/common";

describe("inference result pagination", () => {
  it("shows exactly twenty items per full page and clamps a stale page", () => {
    const items = Array.from({ length: 41 }, (_, index) => index + 1);
    expect(INFERENCE_RESULTS_PAGE_SIZE).toBe(20);
    expect(paginateResults(items, 0)).toMatchObject({ page: 0, pageCount: 3, items: items.slice(0, 20) });
    expect(paginateResults(items, 1)).toMatchObject({ page: 1, pageCount: 3, items: items.slice(20, 40) });
    expect(paginateResults(items, 9)).toMatchObject({ page: 2, pageCount: 3, items: [41] });
  });

  it("pages waves without splitting or hiding their member sessions", () => {
    const run = parseInferenceRun({ id: "run", modelId: "model", modelName: "model", state: "completed", submitted: 45, completed: 45, createdAt: "2026-10-05T00:00:00Z", error: null, requests: Array.from({ length: 45 }, (_, index) => ({
      id: `session-${index}`, waveIndex: index < 25 ? 1 : index - 23, state: "completed", prompt: "p", text: "ok", receivedTokens: 1, ttftMs: 100, prefillTps: null, generationTps: null, finalTps: null, submittedAt: "2026-10-05T00:00:00Z", completedAt: "2026-10-05T00:00:01Z", error: null,
    })) });
    const waves = groupInferenceWaves(run);
    const first = paginateResults(waves, 0), second = paginateResults(waves, 1);
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.requests).toHaveLength(25);
    expect(second.items.map(wave => wave.waveIndex)).toEqual([21]);
    expect([...first.items, ...second.items].flatMap(wave => wave.requests)).toHaveLength(45);
  });
});
