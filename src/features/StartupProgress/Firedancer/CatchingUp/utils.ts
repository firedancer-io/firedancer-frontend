import {
  latestTurbineSlotColor,
  firstTurbineSlotColor,
  missingSlotColor,
  repairedNeedsReplaySlotColor,
  needsReplaySlotColor,
  replayedSlotColor,
} from "../../../../colors";

/**
 * If there are more bars than slots, each slot may be part of multiple bars.
 * Get the last bar that the slot is included in.
 */
export function getMaxBarIndexForSlot(
  slot: number,
  startSlot: number,
  slotsPerBar: number,
  maxBarIndex: number,
) {
  if (!slotsPerBar) return 0;
  const barPosition = Math.ceil((slot - startSlot + 1) / slotsPerBar);
  return Math.min(barPosition - 1, maxBarIndex);
}

function isReplayed(slot: number, latestReplaySlot: number | undefined) {
  if (latestReplaySlot == null) return false;
  return slot <= latestReplaySlot;
}

function isRepaired(slot: number, repairSlots: Set<number>) {
  return repairSlots.has(slot);
}

function isFromTurbine(slot: number, turbineSlots: Set<number>) {
  return turbineSlots.has(slot);
}

function barHasSomeSlot(
  firstBarSlot: number,
  lastBarSlot: number,
  condition: (slot: number) => boolean,
) {
  for (let slot = lastBarSlot; slot >= firstBarSlot; slot--) {
    if (condition(slot)) return true;
  }
  return false;
}

/**
 * Color priorities:
 * - latest turbine
 * - first turbine
 * - missing slot
 * - repaired needs replay slot
 * - needs replay slot
 * - replayed slot
 */
export function getBarColor(
  firstSlot: number,
  lastSlot: number,
  latestReplaySlot: number | undefined,
  repairSlots: Set<number>,
  isFirstTurbine: boolean,
  isLatestTurbine: boolean,
  turbineSlots: Set<number>,
) {
  if (isLatestTurbine) return latestTurbineSlotColor;
  if (isFirstTurbine) return firstTurbineSlotColor;

  if (
    barHasSomeSlot(firstSlot, lastSlot, (slot: number) => {
      return (
        !isReplayed(slot, latestReplaySlot) &&
        !isRepaired(slot, repairSlots) &&
        !isFromTurbine(slot, turbineSlots)
      );
    })
  ) {
    return missingSlotColor;
  }

  // A single slot can be both repaired and received from turbine.
  // In that case, show it as repaired.
  if (
    barHasSomeSlot(firstSlot, lastSlot, (slot: number) => {
      return (
        !isReplayed(slot, latestReplaySlot) && isRepaired(slot, repairSlots)
      );
    })
  ) {
    return repairedNeedsReplaySlotColor;
  }

  if (
    barHasSomeSlot(firstSlot, lastSlot, (slot: number) => {
      return (
        !isReplayed(slot, latestReplaySlot) && isFromTurbine(slot, turbineSlots)
      );
    })
  ) {
    return needsReplaySlotColor;
  }

  return replayedSlotColor;
}
