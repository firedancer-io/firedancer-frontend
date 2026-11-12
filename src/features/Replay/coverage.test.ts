import { describe, it, expect, beforeEach, vi } from "vitest";
import { atom, getDefaultStore } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { createParallelCache } from "./parallelQueriesCache";
import { hasFallbackData, resolveCoverage, type DataLevel } from "./coverage";
import type { NsTsRange } from "../WebGl/webglUtils";

vi.mock("../../nowAtoms", () => ({
  smoothedNowNsAtom: atom<bigint | undefined>(undefined),
}));

type Granularity = "top" | "coarse" | "mid" | "fine";

const store = getDefaultStore();
const tileSizesNs: Record<Granularity, bigint> = {
  top: 64_000n,
  coarse: 32_000n,
  mid: 16_000n,
  fine: 1_000n,
};

let chartCount = 0;
let sentIds: number[];

function makeLevels() {
  const cache = createParallelCache<Granularity>({
    chartId: `coverage-${chartCount++}`,
    getTileSizeNs: (granularity) => tileSizesNs[granularity],
    overscanTilesCount: 0,
    queryKey: "query_agg_cpu",
    sendQuery: (queryId) => sentIds.push(queryId),
    getTileEvictionHighWatermark: () => 1000,
    getTileEvictionLowWatermark: () => 1000,
    onEvictTiles: () => {},
  });
  const load = (
    granularity: Granularity,
    rangeNs: NsTsRange,
    worldRangeNs: NsTsRange,
  ) => {
    sentIds = [];
    cache.queryRange(rangeNs, worldRangeNs, granularity, undefined);
    for (const id of sentIds) cache.markQueryComplete(id);
  };
  // fine stands in for a zoomed-in level, which has no buckets
  const levels = [
    { ...cache.getLevel("top", true), bucketSizeNs: 6_400n },
    { ...cache.getLevel("coarse", true), bucketSizeNs: 3_200n },
    { ...cache.getLevel("mid", true), bucketSizeNs: 1_600n },
    cache.getLevel("fine", false),
  ];
  return { load, levels };
}

// wide enough for 60+ buckets of every level
const wideWindowNs = 1_000_000n;

const levelIdAt = (
  levels: ReturnType<typeof makeLevels>["levels"],
  target: Granularity,
  rangeNs: NsTsRange,
  worldRangeNs: NsTsRange,
  windowNs = wideWindowNs,
) =>
  resolveCoverage(levels, target, rangeNs, windowNs, worldRangeNs).map(
    ({ level }) => level?.id,
  );

beforeEach(() => {
  store.set(socketStateAtom, SocketState.Connected);
});

describe("coverage fallback", () => {
  it("doesn't fall back to a coarser level's stale tail", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 10_500n];
    load("mid", [0n, 10_500n], worldRangeNs);

    // the fine tile at the world end hasn't loaded
    expect(levelIdAt(levels, "fine", [10_000n, 10_500n], worldRangeNs)).toEqual(
      [undefined],
    );
    expect(
      hasFallbackData(
        levels,
        "fine",
        [10_000n, 11_000n],
        wideWindowNs,
        worldRangeNs,
      ),
    ).toBe(false);
  });

  it("falls back to a coarser level's settled tiles", () => {
    const { load, levels } = makeLevels();
    load("mid", [0n, 16_000n], [0n, 20_000n]);

    expect(levelIdAt(levels, "fine", [5_000n, 6_000n], [0n, 20_000n])).toEqual([
      "mid",
    ]);
  });

  it("falls back to a finer level's stale tail and draws the target's own", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 10_500n];
    load("fine", [0n, 10_500n], worldRangeNs);
    expect(levelIdAt(levels, "mid", [10_000n, 10_500n], worldRangeNs)).toEqual([
      "fine",
    ]);

    load("mid", [0n, 10_500n], worldRangeNs);
    expect(levelIdAt(levels, "mid", [10_000n, 10_500n], worldRangeNs)).toEqual([
      "mid",
    ]);
  });

  it("falls back from a non-agg target only to levels with 60+ buckets in view", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    load("coarse", [0n, 32_000n], worldRangeNs);

    // 60 coarse buckets need 192_000ns of view
    expect(
      levelIdAt(levels, "fine", [5_000n, 6_000n], worldRangeNs, 191_999n),
    ).toEqual([undefined]);
    expect(
      hasFallbackData(levels, "fine", [5_000n, 6_000n], 191_999n, worldRangeNs),
    ).toBe(false);

    expect(
      levelIdAt(levels, "fine", [5_000n, 6_000n], worldRangeNs, 192_000n),
    ).toEqual(["coarse"]);
    expect(
      hasFallbackData(levels, "fine", [5_000n, 6_000n], 192_000n, worldRangeNs),
    ).toBe(true);
  });

  it("always draws the target, however few of its buckets are in view", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    load("coarse", [0n, 32_000n], worldRangeNs);

    expect(
      levelIdAt(levels, "coarse", [0n, 32_000n], worldRangeNs, 1_000n),
    ).toEqual(["coarse"]);
  });

  it("falls back from an agg target only to the next coarser level", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    load("coarse", [0n, 32_000n], worldRangeNs);
    expect(
      levelIdAt(levels, "mid", [0n, 16_000n], worldRangeNs, 1_000n),
    ).toEqual(["coarse"]);

    const other = makeLevels();
    other.load("top", [0n, 64_000n], worldRangeNs);
    expect(levelIdAt(other.levels, "mid", [0n, 16_000n], worldRangeNs)).toEqual(
      [undefined],
    );
    expect(
      hasFallbackData(
        other.levels,
        "mid",
        [0n, 16_000n],
        wideWindowNs,
        worldRangeNs,
      ),
    ).toBe(false);
  });
});

function makeAvailableLevel(
  id: string,
  isAgg: boolean,
  isFetched: (rangeNs: NsTsRange) => boolean,
  availableStartNs?: bigint,
): DataLevel {
  return {
    id,
    isAgg,
    tileSizeNs: 10n,
    isRangeFetched: isFetched,
    getAvailableStartNs: () => availableStartNs,
  };
}

describe("coverage before the available start", () => {
  const agg = makeAvailableLevel("agg", true, () => true);
  const levelIds = (levels: DataLevel[], target: string, rangeNs: NsTsRange) =>
    resolveCoverage(levels, target, rangeNs, wideWindowNs).map(
      ({ rangeNs, level }) => [rangeNs, level?.id],
    );

  it("draws the target without falling back before its available start", () => {
    // the server's data starts at 25, so tiles ending before it aren't fetched
    const txn = makeAvailableLevel(
      "txn",
      false,
      ([startNs]) => startNs >= 20n,
      25n,
    );
    expect(levelIds([agg, txn], "txn", [0n, 40n])).toEqual([
      [[0n, 10n], "txn"],
      [[10n, 20n], "txn"],
      [[20n, 25n], "txn"],
      [[25n, 30n], "txn"],
      [[30n, 40n], "txn"],
    ]);
  });

  it("draws the target for a span before the available start whose tile hasn't loaded", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(levelIds([agg, txn], "txn", [20n, 24n])).toEqual([
      [[20n, 24n], "txn"],
    ]);
  });

  it("only falls back after the available start in a tile straddling it", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(levelIds([agg, txn], "txn", [20n, 30n])).toEqual([
      [[20n, 25n], "txn"],
      [[25n, 30n], "agg"],
    ]);
  });

  it("falls back while the target's available start is unknown", () => {
    const txn = makeAvailableLevel("txn", false, ([startNs]) => startNs >= 20n);
    expect(levelIds([agg, txn], "txn", [0n, 30n]).map(([, id]) => id)).toEqual([
      "agg",
      "agg",
      "txn",
    ]);
  });

  it("falls back after the available start while the target loads", () => {
    const txn = makeAvailableLevel(
      "txn",
      false,
      ([startNs]) => startNs < 20n,
      5n,
    );
    expect(levelIds([agg, txn], "txn", [0n, 30n])).toEqual([
      [[0n, 5n], "txn"],
      [[5n, 10n], "txn"],
      [[10n, 20n], "txn"],
      [[20n, 30n], "agg"],
    ]);
  });

  it("only uses the target's available start", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(levelIds([agg, txn], "agg", [0n, 20n]).map(([, id]) => id)).toEqual([
      "agg",
      "agg",
    ]);
  });
});
