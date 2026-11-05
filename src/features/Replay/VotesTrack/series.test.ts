import { describe, expect, it } from "vitest";
import { nsBucketSizes } from "../const";
import type { AggVotesByGranularity } from "./aggAtoms";
import { getAggLatencySeries, getSlotLatencySeries } from "./series";
import type { GetDrawTiles } from "../useAggQuery";

/** Draw every bucket from the target granularity */
const drawTargetOnly: GetDrawTiles = (granularity, first, last) => [
  { granularity, first, last },
];

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
    const series = getAggLatencySeries(
      aggVotes,
      "1s",
      drawTargetOnly,
      referenceNs,
      [0, 2500],
    );

    expect(series.notarized).toEqual([
      { ts: 500, latencyMs: 250, breakBefore: true },
      { ts: 2500, latencyMs: 260, breakBefore: true },
    ]);
    expect(series.skipped).toEqual([1500]);
  });

  it("resamples a coarser fallback granularity into target buckets", () => {
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "2s",
        new Map([
          [5, { notarized: 250, fast: null, slow: 290, skippedCnt: 2 }],
        ]),
      ],
    ]);
    const referenceNs = 10n * nsBucketSizes["1s"];
    const series = getAggLatencySeries(
      aggVotes,
      "1s",
      (_, first, last) => [{ granularity: "2s", first, last }],
      referenceNs,
      [0, 2000],
    );

    // the 2s bucket covers 1s buckets 10 and 11
    expect(series.notarized).toEqual([
      { ts: 500, latencyMs: 250, breakBefore: true },
      { ts: 1500, latencyMs: 250, breakBefore: false },
    ]);
    expect(series.fast).toEqual([]);
    expect(series.skipped).toEqual([500, 1500]);
  });
});
