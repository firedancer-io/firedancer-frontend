import { nsPerMs } from "../../consts.ts";
import { DateTime } from "luxon";
import { defaultWindowMs, type TsRange } from "./const.ts";

export function getInitVisibleRange(
  selectedTs: number | undefined,
  worldEndTs: number,
): TsRange {
  if (selectedTs == null) {
    // show right most data
    return [Math.max(0, worldEndTs - defaultWindowMs), worldEndTs];
  }

  // try to center around selected ts
  const endTs = Math.min(worldEndTs, selectedTs + defaultWindowMs / 2);
  const startTs = Math.max(0, endTs - defaultWindowMs);
  return [startTs, endTs];
}

/**
 * slide window to the right, but maintain window size
 */
export function getUpdatedLiveVisibleRange(
  prevRangeMs: TsRange,
  worldEndMs: number,
): TsRange {
  const prevWindowSize = prevRangeMs[1] - prevRangeMs[0];
  return [worldEndMs - prevWindowSize, worldEndMs];
}

export function calcRelativeMs(referenceNs: bigint, valueNs: bigint) {
  return Number(valueNs - referenceNs) / nsPerMs;
}

export function calcAbsoluteMs(referenceNs: bigint, relativeValueMs: number) {
  const referenceMs = Number(referenceNs / BigInt(nsPerMs));
  return relativeValueMs + referenceMs;
}

export const formatAbsoluteTs = (absoluteMs: number) => {
  return DateTime.fromMillis(absoluteMs).toLocaleString(
    DateTime.DATETIME_MED_WITH_SECONDS,
  );
};
