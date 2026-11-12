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

type Granularity = "top" | "coarse" | "mid" | "batch" | "fine";

const store = getDefaultStore();
const tileSizesNs: Record<Granularity, bigint> = {
  top: 64_000n,
  coarse: 32_000n,
  mid: 16_000n,
  batch: 4_000n,
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
  // batch and fine stand in for zoomed-in (non-agg) levels
  const levels = [
    cache.getLevel("top", true),
    cache.getLevel("coarse", true),
    cache.getLevel("mid", true),
    cache.getLevel("batch", false),
    cache.getLevel("fine", false),
  ];
  return { load, levels };
}

const levelIdAt = (
  levels: DataLevel[],
  target: string,
  rangeNs: NsTsRange,
  worldRangeNs: NsTsRange,
) =>
  resolveCoverage(levels, target, rangeNs, worldRangeNs).map(
    ({ level }) => level?.id,
  );

beforeEach(() => {
  store.set(socketStateAtom, SocketState.Connected);
});

describe("coverage fallback", () => {
  it("doesn't fall back to a coarser level's stale tail", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 10_500n];
    load("batch", [0n, 10_500n], worldRangeNs);

    // the fine tile at the world end hasn't loaded
    expect(levelIdAt(levels, "fine", [10_000n, 10_500n], worldRangeNs)).toEqual(
      [undefined],
    );
    expect(
      hasFallbackData(levels, "fine", [10_000n, 11_000n], worldRangeNs),
    ).toBe(false);
  });

  it("falls back to a coarser non agg level's settled tiles", () => {
    const { load, levels } = makeLevels();
    const worldRangeNs: NsTsRange = [0n, 20_000n];
    load("batch", [0n, 16_000n], worldRangeNs);

    expect(levelIdAt(levels, "fine", [5_000n, 6_000n], worldRangeNs)).toEqual([
      "batch",
    ]);
    expect(
      hasFallbackData(levels, "fine", [5_000n, 6_000n], worldRangeNs),
    ).toBe(true);
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

  it("never falls back to agg levels for a non agg target", () => {
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    for (const agg of ["top", "coarse", "mid"] as const) {
      for (const target of ["batch", "fine"] as const) {
        const { load, levels } = makeLevels();
        load(agg, [0n, 64_000n], worldRangeNs);
        expect(levelIdAt(levels, target, [0n, 4_000n], worldRangeNs)).toEqual(
          Array(Number(4_000n / tileSizesNs[target])).fill(undefined),
        );
        expect(
          hasFallbackData(levels, target, [0n, 4_000n], worldRangeNs),
        ).toBe(false);
      }
    }
  });

  it("never falls back to an agg level finer than a non agg target", () => {
    const fetched = () => true;
    const levels: DataLevel[] = [
      {
        id: "batch",
        isAgg: false,
        tileSizeNs: 10n,
        isRangeFetched: () => false,
      },
      { id: "agg", isAgg: true, tileSizeNs: 10n, isRangeFetched: fetched },
    ];
    expect(levelIdAt(levels, "batch", [0n, 10n], [0n, 10n])).toEqual([
      undefined,
    ]);
    expect(hasFallbackData(levels, "batch", [0n, 10n], [0n, 10n])).toBe(false);
  });

  it("falls back to only the next coarser agg level for an agg target", () => {
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    const next = makeLevels();
    next.load("coarse", [0n, 32_000n], worldRangeNs);
    expect(levelIdAt(next.levels, "mid", [0n, 16_000n], worldRangeNs)).toEqual([
      "coarse",
    ]);
    expect(
      hasFallbackData(next.levels, "mid", [0n, 16_000n], worldRangeNs),
    ).toBe(true);

    const twoCoarser = makeLevels();
    twoCoarser.load("top", [0n, 64_000n], worldRangeNs);
    expect(
      levelIdAt(twoCoarser.levels, "mid", [0n, 16_000n], worldRangeNs),
    ).toEqual([undefined]);
    expect(
      hasFallbackData(twoCoarser.levels, "mid", [0n, 16_000n], worldRangeNs),
    ).toBe(false);
    expect(
      levelIdAt(twoCoarser.levels, "coarse", [0n, 32_000n], worldRangeNs),
    ).toEqual(["top"]);
  });

  it("always draws the target", () => {
    const worldRangeNs: NsTsRange = [0n, 100_000n];
    for (const target of ["top", "mid", "batch", "fine"] as const) {
      const { load, levels } = makeLevels();
      load(target, [0n, 64_000n], worldRangeNs);
      expect(
        new Set(levelIdAt(levels, target, [0n, 16_000n], worldRangeNs)),
      ).toEqual(new Set([target]));
    }
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
  const batch = makeAvailableLevel("batch", false, () => true);
  const levelIds = (levels: DataLevel[], target: string, rangeNs: NsTsRange) =>
    resolveCoverage(levels, target, rangeNs).map(({ rangeNs, level }) => [
      rangeNs,
      level?.id,
    ]);

  it("draws the target without falling back before its available start", () => {
    // the server's data starts at 25, so tiles ending before it aren't fetched
    const txn = makeAvailableLevel(
      "txn",
      false,
      ([startNs]) => startNs >= 20n,
      25n,
    );
    expect(levelIds([batch, txn], "txn", [0n, 40n])).toEqual([
      [[0n, 10n], "txn"],
      [[10n, 20n], "txn"],
      [[20n, 25n], "txn"],
      [[25n, 30n], "txn"],
      [[30n, 40n], "txn"],
    ]);
  });

  it("draws the target for a span before the available start whose tile hasn't loaded", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(levelIds([batch, txn], "txn", [20n, 24n])).toEqual([
      [[20n, 24n], "txn"],
    ]);
  });

  it("only falls back after the available start in a tile straddling it", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(levelIds([batch, txn], "txn", [20n, 30n])).toEqual([
      [[20n, 25n], "txn"],
      [[25n, 30n], "batch"],
    ]);
  });

  it("falls back while the target's available start is unknown", () => {
    const txn = makeAvailableLevel("txn", false, ([startNs]) => startNs >= 20n);
    expect(
      levelIds([batch, txn], "txn", [0n, 30n]).map(([, id]) => id),
    ).toEqual(["batch", "batch", "txn"]);
  });

  it("falls back after the available start while the target loads", () => {
    const txn = makeAvailableLevel(
      "txn",
      false,
      ([startNs]) => startNs < 20n,
      5n,
    );
    expect(levelIds([batch, txn], "txn", [0n, 30n])).toEqual([
      [[0n, 5n], "txn"],
      [[5n, 10n], "txn"],
      [[10n, 20n], "txn"],
      [[20n, 30n], "batch"],
    ]);
  });

  it("only uses the target's available start", () => {
    const txn = makeAvailableLevel("txn", false, () => false, 25n);
    expect(
      levelIds([batch, txn], "batch", [0n, 20n]).map(([, id]) => id),
    ).toEqual(["batch", "batch"]);
  });
});
