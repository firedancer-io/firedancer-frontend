import { sum } from "../../../mathUtils";
import { delayMs, xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { getSlotGroupLeader } from "../../../utils";
import type { SlotsShredsView } from "../../../api/worker/cache/shreds/types";

export function getSlotGroupLabelId(slot: number) {
  return `slot-group-label-${getSlotGroupLeader(slot)}`;
}

export function getSlotLabelId(slot: number) {
  return `slot-label-${slot}`;
}

export function getSlotGroupNameId(slot: number) {
  return `slot-group-name-${getSlotGroupLeader(slot)}`;
}

// prevent x axis tick labels from being cut off
export const chartXPadding = 15;

// lives here, not in ChartAxes, so consumers of the constant alone don't
// pull uplot into their chunk
export const xAxisHeight = 30;

export const minXIncrRange = {
  min: 200,
  max: 1_600,
};

/**
 * Get dynamic x axis tick increments based on chart scale
 */
export const getXIncrs = (scale: number) => {
  const scaledIncr = scale * minXIncrRange.max;
  // round to multiples of minimum increment
  const minIncrMultiple =
    Math.trunc(scaledIncr / minXIncrRange.min) * minXIncrRange.min;

  const incrs = [minIncrMultiple];
  while (incrs[incrs.length - 1] < xRangeMs * scale) {
    incrs.push(incrs[incrs.length - 1] * 2);
  }
  return incrs;
};

/**
 * Get timestamp for "now", which is the ts at x = 0 (right-most in chart).
 * "now" is adjusted using an avg diff of server time and real now ts to smooth out server msg delays.
 * We also delay "now" by one data update interval to prevent instability of right-most data.
 */
export function getAdjustedNow(
  serverTimeMs: number,
  prevTimeDiffs: number[],
  now = Date.now(),
) {
  // Use server time for chart axis
  // Use a rolling avg of the server time and client now diff.
  // If we get ws messages buffered and it results in a temporary high
  // diff, shred still move smoothly by using the avg

  const timeDiff = now - serverTimeMs;
  prevTimeDiffs.push(timeDiff);
  while (prevTimeDiffs.length > 100) {
    prevTimeDiffs.shift();
  }

  const timeDiffAvg = sum(prevTimeDiffs) / prevTimeDiffs.length;
  const adjustedTimeMs = now - timeDiffAvg;
  return adjustedTimeMs - delayMs;
}

export type XRange = {
  minDeltaTs: number;
  maxDeltaTs: number;
  minCanvasPos: number;
  maxCanvasPos: number;
  minCssPos: number;
  maxCssPos: number;
};

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
export function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShredsView,
  xRange: XRange,
) {
  const orderedSlotNumbers = [];
  let maxShreds = 0;

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots.get(slotNumber);
    const rowCount = !slot
      ? 0
      : slot.shreds
        ? slot.shreds.length
        : slot.shredCount;
    if (!rowCount || slot?.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (slot.minEventTsDelta > xRange.maxDeltaTs) {
      // slot started after chart max X
      continue;
    }

    if (
      slot.completionTsDelta != null &&
      slot.completionTsDelta < xRange.minDeltaTs
    ) {
      // slot completed before chart min X
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
    maxShreds = Math.max(maxShreds, rowCount);
  }

  return {
    maxShreds,
    orderedSlotNumbers,
  };
}

export type LabelState = {
  transformX: number;
  width?: number;
  opacity?: string;
  isSkipped?: boolean;
};

export type LabelsState = {
  groups: Map<number, LabelState>;
  slots: Map<number, LabelState>;
  /** when this chart instance applied its first label frame; carried
      across the prev/new swap, reset by remounts */
  firstAppliedAt?: number;
};

export function createLabelsState(): LabelsState {
  return {
    groups: new Map<number, LabelState>(),
    slots: new Map<number, LabelState>(),
  };
}
