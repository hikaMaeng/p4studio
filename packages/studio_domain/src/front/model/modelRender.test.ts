import { describe, expect, it, vi } from "vitest";
import { SliceModel } from "./SliceModel.js";

describe("SliceModel", () => {
  it("notifies subscribers only when the value changes", () => {
    const model = new SliceModel("en");
    const listener = vi.fn();
    const unsubscribe = model.subscribe(listener);
    model.set("en");
    model.set("ko");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(model.getVersion()).toBe(1);
    unsubscribe();
  });
});
