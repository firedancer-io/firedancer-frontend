import { nsPerMs } from "../../consts.ts";
import { DateTime } from "luxon";
import { defaultWindowMs, type TsRange } from "./const.ts";
import { clamp } from "../../uplotReact/utils.ts";

export function getInitVisibleRange(
  selectedMs: number | undefined,
  worldEndMs: number,
): TsRange {
  if (selectedMs == null) {
    // show right most data
    return [Math.max(0, worldEndMs - defaultWindowMs), worldEndMs];
  }

  // try to center around selected ts
  return clamp(
    defaultWindowMs,
    selectedMs - defaultWindowMs / 2,
    selectedMs + defaultWindowMs / 2,
    worldEndMs,
    0,
    worldEndMs,
  );
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

export function getNsStringFromMs(tsMs: number, round: "floor" | "ceil") {
  const intMs = Math.trunc(tsMs);
  // Keep at most 6 fractional digits of ms (ns resolution); round the rest.
  const raw = (tsMs - intMs) * nsPerMs;
  const fracNs = round === "floor" ? Math.floor(raw) : Math.ceil(raw);
  const ns = BigInt(intMs) * 1_000_000n + BigInt(fracNs);

  return ns.toString();
}
