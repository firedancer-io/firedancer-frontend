import { describe, expect, it } from "vitest";
import { nsBucketSizes } from "../const";
import type { AggVotesByGranularity } from "./aggAtoms";
import { getAggLatencySeries, getSlotLatencySeries } from "./series";

describe("getSlotLatencySeries", () => {
  it("breaks lines across slots without a sample", () => {
    const series = getSlotLatencySeries({
      notarized: [
        { slot: 10, ts: 100, latencyMs: 50 },
        { slot: 11, ts: 200, latencyMs: 60 },
        { slot: 13, ts: 400, latencyMs: 70 },
      ],
      fast: [],
      slow: [],
      skipped: [{ slot: 12, ts: 300, latencyMs: 90 }],
    });
    expect(series.notarized.map((p) => p.breakBefore)).toEqual([
      false,
      false,
      true,
    ]);
    expect(series.skipped).toEqual([300]);
  });
});

describe("getAggLatencySeries", () => {
  it("places buckets at their centers and breaks at empty buckets", () => {
    const bucketNs = nsBucketSizes["1s"];
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "1s",
        new Map([
          [10, { notarized: 250, fast: 270, slow: 290, skippedCnt: 0 }],
          [11, { notarized: null, fast: null, slow: null, skippedCnt: 1 }],
          [12, { notarized: 260, fast: 280, slow: 300, skippedCnt: 0 }],
        ]),
      ],
    ]);
    const referenceNs = 10n * bucketNs;
    const series = getAggLatencySeries(aggVotes, "1s", referenceNs, [0, 2500]);

    expect(series.notarized).toEqual([
      { ts: 500, latencyMs: 250, breakBefore: true },
      { ts: 2500, latencyMs: 260, breakBefore: true },
    ]);
    expect(series.skipped).toEqual([1500]);
  });
});
