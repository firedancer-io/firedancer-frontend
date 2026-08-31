import {
  slotCellMinWidth,
  nextBarsWidthPct,
  defaultBarsGap,
  nextBarsBoxMinWidth,
  smallBarsGap,
} from "./const";
import type { SlotLaneInfo } from "./types";

function getSlotDt(
  dtSlot: number | null | undefined,
  referenceSlot: number | null | undefined,
) {
  if (referenceSlot == null || dtSlot == null) return;
  return dtSlot - referenceSlot;
}

export function getSlotLaneInfo({
  label,
  dtSlot,
  referenceSlot,
  className,
  isPinned,
  isNextLeader,
}: {
  label: string;
  dtSlot: number | null | undefined;
  referenceSlot: number | null | undefined;
  className: string;
  isPinned?: boolean;
  isNextLeader?: boolean;
}): SlotLaneInfo {
  return {
    label,
    slot: dtSlot,
    slotDt: getSlotDt(dtSlot, referenceSlot),
    className,
    isPinned,
    isNextLeader,
  };
}

export function getGridColumnsAndGap(
  leftSlotCellsCount: number,
  hasNextLeader: boolean,
  containerWidth: number,
) {
  const slotCellsCount = leftSlotCellsCount + (hasNextLeader ? 1 : 0);
  const { gap, pinNextBarsToMin } =
    containerWidth === 0
      ? { gap: defaultBarsGap, pinNextBarsToMin: false }
      : getSlotCellsGap(containerWidth, slotCellsCount);

  const widths = getGridColumnWidths(slotCellsCount, pinNextBarsToMin);

  const nextLeaderWidth = hasNextLeader ? widths.slotCell : "";
  const columns = `repeat(${leftSlotCellsCount}, ${widths.slotCell}) ${widths.nextSlots} ${nextLeaderWidth}`;

  return {
    columns,
    barsGap: gap,
  };
}

function getSlotCellsNeededWidth(slotCellsCount: number, barsGap: number) {
  return slotCellsCount * slotCellMinWidth + (slotCellsCount - 1) * barsGap;
}

/**
 * Find max slot gap possible without overflowing
 */
function getSlotCellsGap(containerWidth: number, slotCellsCount: number) {
  const defaultAvailableWidth = containerWidth * (1 - nextBarsWidthPct / 100);
  const defaultNeededWidth = getSlotCellsNeededWidth(
    slotCellsCount,
    defaultBarsGap,
  );
  if (defaultNeededWidth <= defaultAvailableWidth) {
    return { gap: defaultBarsGap, pinNextBarsToMin: false };
  }

  // collapse next bars to min width instead of width %
  const maxAvailableWidth = containerWidth - nextBarsBoxMinWidth;
  if (defaultNeededWidth <= maxAvailableWidth) {
    return {
      gap: defaultBarsGap,
      pinNextBarsToMin: true,
    };
  }

  const smallNeededWidth = getSlotCellsNeededWidth(
    slotCellsCount,
    smallBarsGap,
  );
  if (smallNeededWidth <= maxAvailableWidth) {
    return {
      gap: smallBarsGap,
      pinNextBarsToMin: true,
    };
  }

  return {
    gap: 0,
    pinNextBarsToMin: true,
  };
}

function getGridColumnWidths(
  slotCellsCount: number,
  pinNextBarsToMin: boolean,
) {
  if (pinNextBarsToMin) {
    return {
      slotCell: "1fr",
      nextSlots: `${nextBarsBoxMinWidth}px`,
    };
  }

  // get multipliers to split space according to pct
  const nextSlotFrMultiplier = nextBarsWidthPct * slotCellsCount;
  const slotCellFrMultiplier = 100 - nextBarsWidthPct;

  return {
    slotCell: `${slotCellFrMultiplier}fr`,
    nextSlots: `minmax(${nextBarsBoxMinWidth}px, ${nextSlotFrMultiplier}fr)`,
  };
}
