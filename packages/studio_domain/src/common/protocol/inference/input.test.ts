import { describe, expect, it } from "vitest";
import { inferenceRunInputSchema } from "./index.js";

const input = (maxTokens: number) => ({ modelId: "model", prompt: "prompt", concurrency: 1, repetitions: 1, intervalMs: 0, maxTokens });

describe("inference generation-budget input", () => {
  it("accepts zero as the no-user-cap sentinel and the complete P4 u32 range", () => {
    expect(inferenceRunInputSchema.parse(input(0)).maxTokens).toBe(0);
    expect(inferenceRunInputSchema.parse(input(0xffff_ffff)).maxTokens).toBe(0xffff_ffff);
  });

  it("rejects values outside the P4 u32 wire domain", () => {
    expect(inferenceRunInputSchema.safeParse(input(-1)).success).toBe(false);
    expect(inferenceRunInputSchema.safeParse(input(0x1_0000_0000)).success).toBe(false);
  });
});
