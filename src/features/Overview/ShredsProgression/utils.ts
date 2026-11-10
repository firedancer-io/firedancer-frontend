import { delayNs, xRangeMs } from "../../Shreds/const";
import { getSlotGroupLeader } from "../../../utils";
import { slotsPerLeader } from "../../../consts";

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

export function getDelayedNowNs(smoothedNowNs: bigint) {
  return smoothedNowNs - delayNs;
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
};

// x is px from the labels' left
export function getLabelSlotAtX({ groups, slots }: LabelsState, x: number) {
  // later groups paint on top
  let topGroupSlot: number | undefined;
  for (const [groupSlot, group] of groups) {
    if (group.width == null) continue;
    if (x < group.transformX || x > group.transformX + group.width) continue;
    if (topGroupSlot == null || groupSlot > topGroupSlot) {
      topGroupSlot = groupSlot;
    }
  }
  if (topGroupSlot == null) return;

  const groupLeft = groups.get(topGroupSlot)!.transformX;
  let bestSlot: number | undefined;
  let bestDistance = Infinity;
  for (let slot = topGroupSlot; slot < topGroupSlot + slotsPerLeader; slot++) {
    const bar = slots.get(slot);
    if (bar?.width == null) continue;
    // bars are positioned relative to their group
    const left = groupLeft + bar.transformX;
    const right = left + bar.width;
    // hidden bars sit far outside their group
    if (right < groupLeft) continue;

    const distance = Math.max(left - x, x - right, 0);
    if (distance <= bestDistance) {
      bestSlot = slot;
      bestDistance = distance;
    }
  }
  return bestSlot;
}

export function createLabelsState(): LabelsState {
  return {
    groups: new Map<number, LabelState>(),
    slots: new Map<number, LabelState>(),
  };
}
