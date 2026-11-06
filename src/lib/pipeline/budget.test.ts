import { describe, expect, it } from "vitest";
import { costGbp } from "./budget";

describe("pipeline budget", () => {
  it("converts Haiku token usage to GBP", () => {
    expect(costGbp(1_000_000, 0)).toBeCloseTo(0.078, 5);
    expect(costGbp(0, 200_000)).toBeCloseTo(0.078, 5);
  });
});
