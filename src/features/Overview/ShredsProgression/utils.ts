import { delayMs, xRangeMs } from "../../../api/worker/cache/shreds/shredsCalc";
import { getSlotGroupLeader } from "../../../utils";
import type { SlotsShreds } from "./atoms";

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

export function getDelayedNow(smoothedNow: number) {
  return smoothedNow - delayMs;
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
 * Walk orderedSlotNumbers from the back and collect the consecutive trailing
 * slots that are incomplete (no slot_complete event) and not skipped. Stops at
 * the first slot that is complete or skipped. Returned newest-first (the order
 * walked); callers that need a lookup can build a Set.
 *
 * Incomplete slots are drawn extending to the chart's right edge (see
 * addEventsForRow). When the view is positioned right of where data ends, these
 * trailing slots are the ones that paint "residual lines" across the chart, so
 * the draw layer uses this to hide them until the data to their right resolves.
 */
export function getTrailingIncompleteSlots(
  orderedSlotNumbers: number[],
  liveShreds: SlotsShreds,
  skippedSlots: Set<number>,
): number[] {
  const trailing: number[] = [];
  for (let i = orderedSlotNumbers.length - 1; i >= 0; i--) {
    const slotNumber = orderedSlotNumbers[i];
    const slot = liveShreds.slots.get(slotNumber);
    const isIncomplete = slot?.completionTsDelta == null;
    if (!isIncomplete || skippedSlots.has(slotNumber)) break;
    trailing.push(slotNumber);
  }
  return trailing;
}

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
export function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  xRange: XRange,
  skippedSlots: Set<number>,
  // Optional narrower range used solely for the maxShreds (camera Y) calc. When
  // xRange is padded with extra tiles on each side, pass the true visible range
  // here so the camera scales to the tallest *visible* slot, ignoring the
  // padding. Defaults to xRange (no padding).
  visibleRange: { minDeltaTs: number; maxDeltaTs: number } = xRange,
  // When set (any tile is still in flight for this granularity), trailing
  // incomplete+unskipped slots are hidden: their data isn't settled yet, so they
  // must not stretch a bar to the draw window's edge. Undefined (nothing pending,
  // or the Overview live chart) never hides — a genuinely settled incomplete slot
  // is drawn as-is.
  //
  // This is a boolean gate ("is anything pending") rather than a position
  // comparison. An earlier version compared the earliest pending tile's start
  // against the last drawn slot's last event, but that start is a float derived
  // from a ns→ms conversion and the trailing slot's own tile is typically the
  // pending one — so the comparison sat on a sub-microsecond rounding boundary
  // and flipped nondeterministically, occasionally letting the bar through.
  hasPendingTiles?: boolean,
) {
  let orderedSlotNumbers: number[] = [];

  for (
    let slotNumber = minSlotNumber;
    slotNumber <= maxSlotNumber;
    slotNumber++
  ) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds.length || slot.minEventTsDelta == null) {
      // slot has no events
      continue;
    }

    if (slot.minEventTsDelta > xRange.maxDeltaTs) {
      // slot started after chart max X (incl. padding)
      continue;
    }

    // A slot's drawn right extent is its completion, or (if it never completed)
    // its last received event. Cull on the left by that extent so a slot from a
    // disjoint past fetch region — whose events all fall left of the draw window
    // — is dropped, whether or not it ever completed. This is what stops old
    // incomplete slots painting a bar across the whole chart when the view has
    // jumped past a gap of unfetched tiles.
    const slotEndTsDelta = slot.completionTsDelta ?? slot.maxEventTsDelta;
    if (slotEndTsDelta != null && slotEndTsDelta < xRange.minDeltaTs) {
      // slot ended before chart min X (incl. padding)
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
  }

  // Always compute the trailing run so the draw layer can track it (for the
  // immediate hide-on-right-shift gesture), regardless of the gate below.
  const trailingIncompleteSlots = getTrailingIncompleteSlots(
    orderedSlotNumbers,
    liveShreds,
    skippedSlots,
  );

  // Gate: while any tile is still in flight, hide the trailing incomplete run so
  // it can't paint a bar to the edge before its data settles.
  if (hasPendingTiles && trailingIncompleteSlots.length) {
    const hidden = new Set(trailingIncompleteSlots);
    orderedSlotNumbers = orderedSlotNumbers.filter((s) => !hidden.has(s));
  }

  // camera Y scales to the tallest slot intersecting the visible (unpadded)
  // range, over the final (post-trim) set.
  let maxShreds = 0;
  for (const slotNumber of orderedSlotNumbers) {
    const slot = liveShreds.slots.get(slotNumber);
    if (!slot?.shreds.length || slot.minEventTsDelta == null) continue;
    // use the drawn extent (completion, else last event) for the right edge so
    // an incomplete slot whose events all fall left of the visible range doesn't
    // inflate camera-Y.
    const slotEndTsDelta = slot.completionTsDelta ?? slot.maxEventTsDelta;
    const isVisible =
      slot.minEventTsDelta <= visibleRange.maxDeltaTs &&
      (slotEndTsDelta == null || slotEndTsDelta >= visibleRange.minDeltaTs);
    if (isVisible) {
      maxShreds = Math.max(maxShreds, slot.shreds.length);
    }
  }

  return {
    maxShreds,
    orderedSlotNumbers,
    trailingIncompleteSlots,
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
};

export function createLabelsState(): LabelsState {
  return {
    groups: new Map<number, LabelState>(),
    slots: new Map<number, LabelState>(),
  };
}
