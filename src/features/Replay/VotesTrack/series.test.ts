import { describe, expect, it } from "vitest";
import { nsBucketSizes } from "../const";
import type { AggVotesByGranularity } from "./aggAtoms";
import type { DataLevel } from "../coverage";
import { getCoverageLatencySeries, getSlotLatencySeries } from "./series";

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
    });
    expect(series.notarized.map((p) => p.breakBefore)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe("getCoverageLatencySeries", () => {
  const bucketNs = nsBucketSizes["1s"];
  const referenceNs = 10n * bucketNs;
  const aggLevel = (id: string): DataLevel => ({
    id,
    isAgg: true,
    tileSizeNs: 4n * bucketNs,
    isRangeFetched: () => true,
  });
  const slotLevel: DataLevel = {
    id: "slot",
    isAgg: false,
    tileSizeNs: 4n * bucketNs,
    isRangeFetched: () => true,
  };
  const slotSeries = getSlotLatencySeries({
    notarized: [
      { slot: 10, ts: 4200, latencyMs: 40 },
      { slot: 11, ts: 4600, latencyMs: 45 },
    ],
    fast: [],
    slow: [],
  });

  it("places buckets at their centers and breaks at empty buckets", () => {
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "1s",
        new Map([
          [10, { notarized: 250, fast: 270, slow: 290 }],
          [11, { notarized: null, fast: null, slow: null }],
          [12, { notarized: 260, fast: 280, slow: 300 }],
        ]),
      ],
    ]);
    const level = aggLevel("1s");
    const series = getCoverageLatencySeries(
      [{ rangeNs: [referenceNs, referenceNs + 3n * bucketNs], level }],
      level,
      aggVotes,
      slotSeries,
      referenceNs,
    );

    expect(series.notarized).toEqual([
      { ts: 500, latencyMs: 250, breakBefore: true },
      { ts: 2500, latencyMs: 260, breakBefore: true },
    ]);
  });

  it("draws each span from its level, and the target where none has it", () => {
    const aggVotes: AggVotesByGranularity = new Map([
      ["1s", new Map([[11, { notarized: 250, fast: null, slow: null }]])],
    ]);
    const target = aggLevel("1s");
    const series = getCoverageLatencySeries(
      [
        { rangeNs: [referenceNs, referenceNs + 4n * bucketNs], level: target },
        {
          rangeNs: [referenceNs + 4n * bucketNs, referenceNs + 8n * bucketNs],
          level: slotLevel,
        },
        {
          rangeNs: [referenceNs + 8n * bucketNs, referenceNs + 12n * bucketNs],
          level: undefined,
        },
      ],
      target,
      aggVotes,
      slotSeries,
      referenceNs,
    );

    expect(series.notarized).toEqual([
      { ts: 1500, latencyMs: 250, breakBefore: true },
      // after the empty 1s buckets 12 and 13
      { slot: 10, ts: 4200, latencyMs: 40, breakBefore: true },
      { slot: 11, ts: 4600, latencyMs: 45, breakBefore: false },
    ]);
  });

  it("draws a coarser fallback granularity at its own buckets", () => {
    const aggVotes: AggVotesByGranularity = new Map([
      ["8s", new Map([[1, { notarized: 300, fast: null, slow: null }]])],
    ]);
    const series = getCoverageLatencySeries(
      [
        {
          rangeNs: [referenceNs, referenceNs + 4n * bucketNs],
          level: aggLevel("8s"),
        },
      ],
      aggLevel("1s"),
      aggVotes,
      slotSeries,
      referenceNs,
    );

    // the 8s bucket [8s, 16s) is centered 2s after the reference
    expect(series.notarized).toEqual([
      { ts: 2000, latencyMs: 300, breakBefore: true },
    ]);
  });

  it("breaks lines across slot spans without samples", () => {
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "1s",
        new Map([
          [13, { notarized: null, fast: 110, slow: null }],
          [18, { notarized: null, fast: 120, slow: null }],
        ]),
      ],
    ]);
    const level = aggLevel("1s");
    const series = getCoverageLatencySeries(
      [
        { rangeNs: [referenceNs, referenceNs + 4n * bucketNs], level },
        {
          rangeNs: [referenceNs + 4n * bucketNs, referenceNs + 8n * bucketNs],
          level: slotLevel,
        },
        {
          rangeNs: [referenceNs + 8n * bucketNs, referenceNs + 12n * bucketNs],
          level,
        },
      ],
      level,
      aggVotes,
      slotSeries,
      referenceNs,
    );

    expect(series.fast).toEqual([
      { ts: 3500, latencyMs: 110, breakBefore: true },
      { ts: 8500, latencyMs: 120, breakBefore: true },
    ]);
  });

  it("clips a coarser fallback's line to a span without its bucket centers", () => {
    // 8s buckets centered 2s and 10s after the reference
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "8s",
        new Map([
          [1, { notarized: 100, fast: null, slow: null }],
          [2, { notarized: 200, fast: null, slow: null }],
        ]),
      ],
    ]);
    const slotPoints = getSlotLatencySeries({
      notarized: [
        { slot: 1, ts: 1000, latencyMs: 90 },
        { slot: 2, ts: 9000, latencyMs: 95 },
      ],
      fast: [],
      slow: [],
    });
    const series = getCoverageLatencySeries(
      [
        {
          rangeNs: [referenceNs, referenceNs + 4n * bucketNs],
          level: slotLevel,
        },
        {
          rangeNs: [referenceNs + 4n * bucketNs, referenceNs + 8n * bucketNs],
          level: aggLevel("8s"),
        },
        {
          rangeNs: [referenceNs + 8n * bucketNs, referenceNs + 12n * bucketNs],
          level: slotLevel,
        },
      ],
      slotLevel,
      aggVotes,
      slotPoints,
      referenceNs,
    );

    expect(series.notarized).toEqual([
      { slot: 1, ts: 1000, latencyMs: 90, breakBefore: true },
      { ts: 4000, latencyMs: 125, breakBefore: false },
      { ts: 8000, latencyMs: 175, breakBefore: false },
      { slot: 2, ts: 9000, latencyMs: 95, breakBefore: false },
    ]);
  });

  it("breaks lines across agg spans without samples", () => {
    // only the 1m bucket [120s, 180s) has a sample, far past the agg span
    const aggVotes: AggVotesByGranularity = new Map([
      ["1m", new Map([[2, { notarized: 300, fast: null, slow: null }]])],
    ]);
    const slotPoints = getSlotLatencySeries({
      notarized: [
        { slot: 1, ts: 1000, latencyMs: 90 },
        { slot: 2, ts: 9000, latencyMs: 95 },
      ],
      fast: [],
      slow: [],
    });
    const series = getCoverageLatencySeries(
      [
        {
          rangeNs: [referenceNs, referenceNs + 4n * bucketNs],
          level: slotLevel,
        },
        {
          rangeNs: [referenceNs + 4n * bucketNs, referenceNs + 8n * bucketNs],
          level: aggLevel("1m"),
        },
        {
          rangeNs: [referenceNs + 8n * bucketNs, referenceNs + 12n * bucketNs],
          level: slotLevel,
        },
      ],
      slotLevel,
      aggVotes,
      slotPoints,
      referenceNs,
    );

    expect(series.notarized.map(({ breakBefore }) => breakBefore)).toEqual([
      true,
      true,
    ]);
  });

  it("includes an agg sample centered on its span's end", () => {
    // 4s buckets centered on the reference and 4s after it
    const aggVotes: AggVotesByGranularity = new Map([
      [
        "4s",
        new Map([
          [2, { notarized: 100, fast: null, slow: null }],
          [3, { notarized: 200, fast: null, slow: null }],
        ]),
      ],
    ]);
    const slotPoints = getSlotLatencySeries({
      notarized: [{ slot: 1, ts: 8000, latencyMs: 90 }],
      fast: [],
      slow: [],
    });
    const level = aggLevel("4s");
    const series = getCoverageLatencySeries(
      [
        { rangeNs: [referenceNs, referenceNs + 4n * bucketNs], level },
        {
          rangeNs: [referenceNs + 4n * bucketNs, referenceNs + 12n * bucketNs],
          level: slotLevel,
        },
      ],
      level,
      aggVotes,
      slotPoints,
      referenceNs,
    );

    expect(series.notarized.map(({ ts }) => ts)).toEqual([0, 4000, 8000]);
  });
});
