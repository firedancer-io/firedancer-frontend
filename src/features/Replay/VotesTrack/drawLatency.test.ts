import { describe, expect, it } from "vitest";
import { getLatencyTicks } from "./drawLatency";

describe("getLatencyTicks", () => {
  it("picks at most 3 evenly spaced round ticks covering the max", () => {
    expect(getLatencyTicks(140)).toEqual([50, 100, 150]);
    expect(getLatencyTicks(340)).toEqual([200, 400]);
    expect(getLatencyTicks(260)).toEqual([100, 200, 300]);
  });

  it("falls back to a default scale without data", () => {
    expect(getLatencyTicks(0)).toEqual([50, 100, 150]);
  });
});
