import { describe, expect, it } from "vitest";
import { INFERENCE_RESULTS_PAGE_SIZE, paginateResults } from "./pagination.js";

describe("inference result pagination", () => {
  it("shows exactly twenty items per full page and clamps a stale page", () => {
    const items = Array.from({ length: 41 }, (_, index) => index + 1);
    expect(INFERENCE_RESULTS_PAGE_SIZE).toBe(20);
    expect(paginateResults(items, 0)).toMatchObject({ page: 0, pageCount: 3, items: items.slice(0, 20) });
    expect(paginateResults(items, 1)).toMatchObject({ page: 1, pageCount: 3, items: items.slice(20, 40) });
    expect(paginateResults(items, 9)).toMatchObject({ page: 2, pageCount: 3, items: [41] });
  });
});
