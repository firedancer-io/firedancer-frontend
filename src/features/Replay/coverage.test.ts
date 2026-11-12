import { describe, it, expect, beforeEach, vi } from "vitest";
import { atom, getDefaultStore } from "jotai";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { createParallelCache } from "./parallelQueriesCache";
import { hasFallbackData, resolveCoverage, type DataLevel } from "./coverage";
import type { NsTsRange } from "../WebGl/webglUtils";
import { getAggGranularityForQuery } from "./utils";

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
  // fine stands in for a zoomed-in (non-agg) level
  const levels = [
    cache.getLevel("top", true),
    cache.getLevel("coarse", true),
    cache.getLevel("mid", true),
    cache.getLevel("fine", false),
  ];
  return { load, levels };
}

// viewAgg: the agg level the view would use
const levelIdAt = (
  levels: ReturnType<typeof makeLevels>["levels"],
  target: Granularity,
  viewAgg: Granularity,
  rangeNs: NsTsRange,
  worldRangeNs: NsTsRange,
) =>
  resolveCoverage(levels, target, rangeNs, viewAgg, worldRangeNs).map(
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
    expect(
      levelIdAt(levels, "fine", "mid", [10_000n, 10_500n], worldRangeNs),
    ).toEqual([undefined]);
    expect(
      hasFallbackData(levels, "fine", [10_000n, 11_000n], "mid", worldRangeNs),
    ).toBe(false);
  });

  it("falls back to a coarser level's settled tiles", () => {
    const { load, levels } = makeLevels();
    load("mid", [0n, 16_000n], [0n, 20_000n]);

    expect(
      levelIdAt(levels, "fine", "mid", [5_000n, 6_000n], [0n, 20_000n]),
    ).toEqual(["mid"]);
  });

  it("falls back to a finer level's stale tail and draws the target's own", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 10_500n];
    load("fine", [0n, 10_500n], worldRangeNs);
    expect(
      levelIdAt(levels, "mid", "mid", [10_000n, 10_500n], worldRangeNs),
    ).toEqual(["fine"]);

    load("mid", [0n, 10_500n], worldRangeNs);
    expect(
      levelIdAt(levels, "mid", "mid", [10_000n, 10_500n], worldRangeNs),
    ).toEqual(["mid"]);
  });

  it("falls back to agg levels at most one coarser than the view's agg level", () => {
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    for (const target of ["mid", "fine"] as const) {
      const { load, levels } = makeLevels();
      load("coarse", [0n, 32_000n], worldRangeNs);
      expect(
        new Set(levelIdAt(levels, target, "mid", [0n, 16_000n], worldRangeNs)),
      ).toEqual(new Set(["coarse"]));
      expect(
        hasFallbackData(levels, target, [0n, 16_000n], "mid", worldRangeNs),
      ).toBe(true);

      const other = makeLevels();
      other.load("top", [0n, 64_000n], worldRangeNs);
      expect(
        new Set(
          levelIdAt(other.levels, target, "mid", [0n, 16_000n], worldRangeNs),
        ),
      ).toEqual(new Set([undefined]));
      expect(
        hasFallbackData(
          other.levels,
          target,
          [0n, 16_000n],
          "mid",
          worldRangeNs,
        ),
      ).toBe(false);
    }
  });

  it("falls back to no coarser agg level when the target is clamped", () => {
    // the view's agg level is finer than the target, the query's finest
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    const { load, levels } = makeLevels();
    load("top", [0n, 64_000n], worldRangeNs);
    expect(
      levelIdAt(levels, "coarse", "mid", [0n, 32_000n], worldRangeNs),
    ).toEqual([undefined]);
    expect(
      hasFallbackData(levels, "coarse", [0n, 32_000n], "mid", worldRangeNs),
    ).toBe(false);

    load("mid", [0n, 32_000n], worldRangeNs);
    expect(
      levelIdAt(levels, "coarse", "mid", [0n, 32_000n], worldRangeNs),
    ).toEqual(["mid"]);
  });

  it("always draws the target", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    load("top", [0n, 64_000n], worldRangeNs);

    expect(
      levelIdAt(levels, "top", "top", [0n, 64_000n], worldRangeNs),
    ).toEqual(["top"]);
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
    resolveCoverage(levels, target, rangeNs, "agg").map(
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

describe("the agg level a view would use", () => {
  it("ignores the query's finest granularity when asked", () => {
    // shreds' finest agg granularity is 250ms
    expect(getAggGranularityForQuery("query_agg_shreds", 12_000, 2000)).toBe(
      "250ms",
    );
    expect(
      getAggGranularityForQuery("query_agg_shreds", 12_000, 2000, {
        ignoreMinimum: true,
      }),
    ).toBe("25ms");
    expect(
      getAggGranularityForQuery("query_agg_shreds", 900_000, 2000, {
        ignoreMinimum: true,
      }),
    ).toBe("500ms");
  });
});
