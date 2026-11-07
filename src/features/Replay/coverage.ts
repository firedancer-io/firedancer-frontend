import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import { bigIntMax, bigIntMin } from "../../mathUtils";
import { calcRelativeMs } from "./utils";

/**
 * One level of a track's data, e.g. an agg granularity or a non agg
 * granularity, as tiles of a fixed size
 */
export interface DataLevel<Id extends string = string> {
  id: Id;
  isAgg: boolean;
  tileSizeNs: bigint;
  /** Whether every tile overlapping [startNs, endNs) has data */
  isRangeFetched: (rangeNs: NsTsRange) => boolean;
}

export interface CoverageSpan<Id extends string = string> {
  rangeNs: NsTsRange;
  /** level to draw the span from, undefined if no level has its data */
  level: DataLevel<Id> | undefined;
}

/**
 * Split [startNs, endNs) at the target level's tile boundaries. Each span is
 * drawn from the target level if its whole tile has loaded, otherwise from
 * another level that has. Levels of the same mode (agg or non agg) as the
 * target are preferred, then finer levels over coarser ones, since finer data
 * resamples exactly, then closer levels. Tiles are clipped to the world range
 * before checking, since tiles are never fetched outside of it.
 *
 * @param granularityLevels ordered from coarsest to finest
 */
export function resolveCoverage<Id extends string>(
  granularityLevels: DataLevel<Id>[],
  targetId: Id,
  [startNs, endNs]: NsTsRange,
  worldRangeNs?: NsTsRange,
): CoverageSpan<Id>[] {
  const targetIdx = granularityLevels.findIndex(({ id }) => id === targetId);
  const { isAgg, tileSizeNs } = granularityLevels[targetIdx];
  const getModeDist = (level: DataLevel<Id>) => Number(level.isAgg !== isAgg);
  const isCoarser = (idx: number) => Number(idx < targetIdx);
  const getDist = (idx: number) => Math.abs(idx - targetIdx);
  const candidates = granularityLevels
    .map((level, idx) => ({ level, idx }))
    .sort(
      (a, b) =>
        getModeDist(a.level) - getModeDist(b.level) ||
        isCoarser(a.idx) - isCoarser(b.idx) ||
        getDist(a.idx) - getDist(b.idx),
    )
    .map(({ level }) => level);

  const spans: CoverageSpan<Id>[] = [];
  for (
    let tileStartNs = (startNs / tileSizeNs) * tileSizeNs;
    tileStartNs < endNs;
    tileStartNs += tileSizeNs
  ) {
    const tileEndNs = tileStartNs + tileSizeNs;
    const fetchRangeNs: NsTsRange = worldRangeNs
      ? [
          bigIntMax(tileStartNs, worldRangeNs[0]),
          bigIntMin(tileEndNs, worldRangeNs[1]),
        ]
      : [tileStartNs, tileEndNs];
    spans.push({
      rangeNs: [bigIntMax(tileStartNs, startNs), bigIntMin(tileEndNs, endNs)],
      level: candidates.find((level) => level.isRangeFetched(fetchRangeNs)),
    });
  }
  return spans;
}

/**
 * Whether every span of [startNs, endNs) can be drawn from some level
 */
export function isRangeCovered<Id extends string>(
  granularityLevels: DataLevel<Id>[],
  targetId: Id,
  rangeNs: NsTsRange,
  worldRangeNs?: NsTsRange,
): boolean {
  return resolveCoverage(
    granularityLevels,
    targetId,
    rangeNs,
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
      modeRanges[modeRanges.length - 1][1] = endMs;
    } else {
      modeRanges.push([calcRelativeMs(referenceNs, rangeNs[0]), endMs]);
    }
    prevIsAgg = isAgg;
  }
  return ranges;
}

/**
 * Keep drawing `prev` until all of `target`'s visible data has arrived, as
 * long as all of `prev`'s visible data is still available.
 */
export function resolveHeldDraw<T>(
  prev: T | undefined,
  target: T,
  isVisibleDrawable: (value: T) => boolean,
): T {
  if (prev === undefined || prev === target || isVisibleDrawable(target))
    return target;
  return isVisibleDrawable(prev) ? prev : target;
}
