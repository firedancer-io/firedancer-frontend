import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import { bigIntMax, bigIntMin } from "../../mathUtils";
import { calcRelativeMs } from "./utils";

/**
 * A granularity a track can draw a time range from once it has data there
 */
export interface DataLevel {
  id: string;
  isAgg: boolean;
  tileSizeNs: bigint;
  // agg levels only
  bucketSizeNs?: bigint;
  /**
   * Returns whether every tile overlapping the range has data. Stale tiles
   * only have data up to their last refresh.
   */
  isRangeFetched: (rangeNs: NsTsRange, includeStale?: boolean) => boolean;
  getAvailableStartNs?: () => bigint | undefined;
}

// fewer buckets in view draw as blocks that look nothing like the data
const MIN_FALLBACK_BUCKETS_IN_VIEW = 60n;

export function isTooCoarseFallback(level: DataLevel, windowNs: bigint) {
  return (
    level.bucketSizeNs !== undefined &&
    level.bucketSizeNs * MIN_FALLBACK_BUCKETS_IN_VIEW > windowNs
  );
}

/**
 * A span of the track's time range and the level it's drawn from
 */
export interface CoverageSpan {
  rangeNs: NsTsRange;
  level: DataLevel | undefined;
}

/**
 * Split the range at the target level's tile boundaries and pick a level to
 * draw each span from: the target if its tile has loaded, otherwise another
 * level that has the tile's data. Other levels of the target's mode (agg or
 * non agg) are preferred, then finer levels over coarser ones, then closer
 * ones. Spans are also split at the target's available start, and the part
 * before it is drawn from the target, so it shows nothing.
 */
export function resolveCoverage(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  rangeNs: NsTsRange,
  windowNs: bigint,
  worldRangeNs?: NsTsRange,
): CoverageSpan[] {
  const targetLevelIdx = granularityLevels.findIndex(
    ({ id }) => id === targetLevelId,
  );
  const targetLevel = granularityLevels[targetLevelIdx];
  const { isAgg, tileSizeNs } = targetLevel;
  const availableStartNs = targetLevel.getAvailableStartNs?.();
  // target, then finer levels, then coarser ones ordered by nearness to target
  const byDist = [
    ...granularityLevels.slice(targetLevelIdx),
    ...granularityLevels.slice(0, targetLevelIdx).reverse(),
  ];
  const usable = byDist.filter(
    (level) =>
      level.id === targetLevelId || !isTooCoarseFallback(level, windowNs),
  );
  // prefer the target's mode since each switch between modes adds a render pass
  const candidates = [
    ...usable.filter((level) => level.isAgg === isAgg),
    ...usable.filter((level) => level.isAgg !== isAgg),
  ];

  // coarser levels refresh their stale tail too rarely to stand in for the target
  const coarserLevels = new Set(granularityLevels.slice(0, targetLevelIdx));

  const spans: CoverageSpan[] = [];
  for (
    let tileStartNs = (rangeNs[0] / tileSizeNs) * tileSizeNs;
    tileStartNs < rangeNs[1];
    tileStartNs += tileSizeNs
  ) {
    const tileEndNs = tileStartNs + tileSizeNs;
    let spanStartNs = bigIntMax(tileStartNs, rangeNs[0]);
    const spanEndNs = bigIntMin(tileEndNs, rangeNs[1]);
    let fetchStartNs = worldRangeNs
      ? bigIntMax(tileStartNs, worldRangeNs[0])
      : tileStartNs;
    const fetchEndNs = worldRangeNs
      ? bigIntMin(tileEndNs, worldRangeNs[1])
      : tileEndNs;

    if (availableStartNs !== undefined && spanStartNs < availableStartNs) {
      const targetEndNs = bigIntMin(spanEndNs, availableStartNs);
      spans.push({ rangeNs: [spanStartNs, targetEndNs], level: targetLevel });
      if (targetEndNs === spanEndNs) continue;
      spanStartNs = targetEndNs;
      fetchStartNs = bigIntMax(fetchStartNs, availableStartNs);
    }

    const fetchRangeNs: NsTsRange = [fetchStartNs, fetchEndNs];
    spans.push({
      rangeNs: [spanStartNs, spanEndNs],
      level: candidates.find((level) =>
        level.isRangeFetched(fetchRangeNs, !coarserLevels.has(level)),
      ),
    });
  }
  return spans;
}

/**
 * Whether a level other than the target has all of the range in the world, so
 * it can be drawn while the target loads
 */
export function hasFallbackData(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  rangeNs: NsTsRange,
  windowNs: bigint,
  worldRangeNs?: NsTsRange,
): boolean {
  const fetchRangeNs: NsTsRange = worldRangeNs
    ? [
        bigIntMax(rangeNs[0], worldRangeNs[0]),
        bigIntMin(rangeNs[1], worldRangeNs[1]),
      ]
    : rangeNs;
  const targetLevelIdx = granularityLevels.findIndex(
    ({ id }) => id === targetLevelId,
  );
  return granularityLevels.some(
    (level, idx) =>
      idx !== targetLevelIdx &&
      !isTooCoarseFallback(level, windowNs) &&
      level.isRangeFetched(fetchRangeNs, idx > targetLevelIdx),
  );
}

/**
 * Whether every span of the range can be drawn from some level
 */
export function isRangeCovered(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  rangeNs: NsTsRange,
  windowNs: bigint,
  worldRangeNs?: NsTsRange,
): boolean {
  return resolveCoverage(
    granularityLevels,
    targetLevelId,
    rangeNs,
    windowNs,
    worldRangeNs,
  ).every(({ level }) => level !== undefined);
}

/** Visible ms ranges drawn by each mode */
export interface ModeRanges {
  agg: TsRange[];
  nonAgg: TsRange[];
}

/**
 * Merge adjacent spans drawn by the same mode into ms ranges. Spans without
 * data are drawn by the target mode.
 */
export function getModeRanges(
  spans: CoverageSpan[],
  isTargetAgg: boolean,
  referenceNs: bigint,
): ModeRanges {
  const ranges: ModeRanges = { agg: [], nonAgg: [] };
  let prevIsAgg: boolean | undefined;
  for (const { rangeNs, level } of spans) {
    const isAgg = level?.isAgg ?? isTargetAgg;
    const modeRanges = isAgg ? ranges.agg : ranges.nonAgg;
    const endMs = calcRelativeMs(referenceNs, rangeNs[1]);
    if (isAgg === prevIsAgg) {
      // same mode as the previous span, so extend its range to this span's end
      modeRanges[modeRanges.length - 1][1] = endMs;
    } else {
      // mode changed, so start a new range for this mode
      modeRanges.push([calcRelativeMs(referenceNs, rangeNs[0]), endMs]);
    }
    prevIsAgg = isAgg;
  }
  return ranges;
}
