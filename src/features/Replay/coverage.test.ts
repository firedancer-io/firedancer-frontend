import { describe, expect, it } from "vitest";
import {
  getModeRanges,
  isRangeCovered,
  resolveCoverage,
  resolveHeldDraw,
  type CoverageSpan,
  type DataLevel,
} from "./coverage";
import { nsPerMs } from "../../consts";

/** level with tiles of `tileSizeNs`, of which `fetched` tile idxs have data */
function level(
  id: string,
  tileSizeNs: bigint,
  fetched: number[],
  isAgg = true,
): DataLevel<string> {
  return {
    id,
    isAgg,
    tileSizeNs,
    isRangeFetched: ([startNs, endNs]) => {
      for (
        let ns = (startNs / tileSizeNs) * tileSizeNs;
        ns < endNs;
        ns += tileSizeNs
      ) {
        if (!fetched.includes(Number(ns / tileSizeNs))) return false;
      }
      return true;
    },
  };
}

function toIds(spans: CoverageSpan[]) {
  return spans.map(({ rangeNs, level }) => ({ rangeNs, level: level?.id }));
}

describe("resolveCoverage", () => {
  it("splits at target tile boundaries, clipped to the range", () => {
    const granularityLevels = [level("a", 10n, [0, 1, 2])];
    expect(toIds(resolveCoverage(granularityLevels, "a", [5n, 25n]))).toEqual([
      { rangeNs: [5n, 10n], level: "a" },
      { rangeNs: [10n, 20n], level: "a" },
      { rangeNs: [20n, 25n], level: "a" },
    ]);
  });

  it("falls back to finer levels before coarser ones", () => {
    const granularityLevels = [
      level("coarser", 80n, [0]),
      level("coarse", 40n, [0]),
      level("target", 20n, [0]),
      level("fine", 10n, [2, 3]),
      level("finer", 5n, [8, 9, 10, 11]),
    ];
    expect(
      toIds(resolveCoverage(granularityLevels, "target", [0n, 80n])),
    ).toEqual([
      { rangeNs: [0n, 20n], level: "target" },
      // closest finer level
      { rangeNs: [20n, 40n], level: "fine" },
      // finer over closer coarse
      { rangeNs: [40n, 60n], level: "finer" },
      // closest coarser level once no finer one has the span
      { rangeNs: [60n, 80n], level: "coarser" },
    ]);
  });

  it("prefers levels of the target's mode", () => {
    const granularityLevels = [
      level("agg", 20n, [0]),
      level("fec", 10n, [], false),
      level("shred", 10n, [0], false),
    ];
    expect(toIds(resolveCoverage(granularityLevels, "fec", [0n, 10n]))).toEqual(
      [{ rangeNs: [0n, 10n], level: "shred" }],
    );
  });

  it("checks the whole tile, even when only part of it is in range", () => {
    const granularityLevels = [
      level("target", 20n, []),
      level("fine", 10n, [0]),
    ];
    expect(
      toIds(resolveCoverage(granularityLevels, "target", [0n, 5n])),
    ).toEqual([{ rangeNs: [0n, 5n], level: undefined }]);
  });

  it("only checks the in-world part of tiles", () => {
    const granularityLevels = [
      level("target", 20n, []),
      level("fine", 10n, [1]),
    ];
    expect(
      toIds(
        resolveCoverage(granularityLevels, "target", [0n, 20n], [10n, 100n]),
      ),
    ).toEqual([{ rangeNs: [0n, 20n], level: "fine" }]);
  });

  it("is covered only if every span has a level", () => {
    const granularityLevels = [level("a", 10n, [0, 2])];
    expect(isRangeCovered(granularityLevels, "a", [0n, 10n])).toBe(true);
    expect(isRangeCovered(granularityLevels, "a", [0n, 30n])).toBe(false);
    expect(isRangeCovered(granularityLevels, "a", [10n, 10n])).toBe(true);
  });
});

describe("getModeRanges", () => {
  const ms = (value: number) => BigInt(value * nsPerMs);
  const agg = level("agg", ms(10), []);
  const nonAgg = level("nonAgg", ms(10), [], false);

  it("merges adjacent spans of the same mode", () => {
    const spans: CoverageSpan[] = [
      { rangeNs: [ms(0), ms(10)], level: agg },
      { rangeNs: [ms(10), ms(20)], level: agg },
      { rangeNs: [ms(20), ms(30)], level: nonAgg },
      { rangeNs: [ms(30), ms(40)], level: agg },
    ];
    expect(getModeRanges(spans, true, 0n)).toEqual({
      agg: [
        [0, 20],
        [30, 40],
      ],
      nonAgg: [[20, 30]],
    });
  });

  it("draws spans without data in the target mode", () => {
    const spans: CoverageSpan[] = [
      { rangeNs: [ms(0), ms(10)], level: agg },
      { rangeNs: [ms(10), ms(20)], level: undefined },
    ];
    expect(getModeRanges(spans, false, 0n)).toEqual({
      agg: [[0, 10]],
      nonAgg: [[10, 20]],
    });
    expect(getModeRanges(spans, true, 0n)).toEqual({
      agg: [[0, 20]],
      nonAgg: [],
    });
  });
});

describe("resolveHeldDraw", () => {
  it("holds prev until target is drawable", () => {
    expect(resolveHeldDraw(undefined, "b", () => false)).toBe("b");
    expect(resolveHeldDraw("a", "b", (v) => v === "a")).toBe("a");
    expect(resolveHeldDraw("a", "b", () => true)).toBe("b");
    expect(resolveHeldDraw("a", "b", () => false)).toBe("b");
  });
});
