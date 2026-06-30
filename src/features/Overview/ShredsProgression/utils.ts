import { xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { getSlotGroupLeader } from "../../../utils";

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
