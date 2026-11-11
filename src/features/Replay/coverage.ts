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
  /** Returns whether every tile overlapping the range has data */
  isRangeFetched: (rangeNs: NsTsRange) => boolean;
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
 * ones.
 */
export function resolveCoverage(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  rangeNs: NsTsRange,
  worldRangeNs?: NsTsRange,
): CoverageSpan[] {
  const targetLevelIdx = granularityLevels.findIndex(
    ({ id }) => id === targetLevelId,
  );
  const { isAgg, tileSizeNs } = granularityLevels[targetLevelIdx];
  // target, then finer levels, then coarser ones ordered by nearness to target
  const byDist = [
    ...granularityLevels.slice(targetLevelIdx),
    ...granularityLevels.slice(0, targetLevelIdx).reverse(),
  ];
  // prefer the target's mode since each switch between modes adds a render pass
  const candidates = [
    ...byDist.filter((level) => level.isAgg === isAgg),
    ...byDist.filter((level) => level.isAgg !== isAgg),
  ];

  const spans: CoverageSpan[] = [];
  for (
    let tileStartNs = (rangeNs[0] / tileSizeNs) * tileSizeNs;
    tileStartNs < rangeNs[1];
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
      rangeNs: [
        bigIntMax(tileStartNs, rangeNs[0]),
        bigIntMin(tileEndNs, rangeNs[1]),
      ],
      level: candidates.find((level) => level.isRangeFetched(fetchRangeNs)),
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
  worldRangeNs?: NsTsRange,
): boolean {
  const fetchRangeNs: NsTsRange = worldRangeNs
    ? [
        bigIntMax(rangeNs[0], worldRangeNs[0]),
        bigIntMin(rangeNs[1], worldRangeNs[1]),
      ]
    : rangeNs;
  return granularityLevels.some(
    (level) => level.id !== targetLevelId && level.isRangeFetched(fetchRangeNs),
  );
}

/**
 * Whether every span of the range can be drawn from some level
 */
export function isRangeCovered(
  granularityLevels: DataLevel[],
  targetLevelId: string,
  rangeNs: NsTsRange,
  worldRangeNs?: NsTsRange,
): boolean {
  return resolveCoverage(
    granularityLevels,
    targetLevelId,
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
