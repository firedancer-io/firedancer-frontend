import { slotCellMinWidth, defaultCellsGap, smallCellsGap } from "./const";
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
}: {
  label: string;
  dtSlot: number | null | undefined;
  referenceSlot: number | null | undefined;
  className?: string;
  isPinned?: boolean;
}): SlotLaneInfo {
  return {
    label,
    slot: dtSlot,
    slotDt: getSlotDt(dtSlot, referenceSlot),
    className,
    isPinned,
  };
}

export function getCellsGap(cellsCount: number, containerWidth: number) {
  // before width is measured, assume default gap for initial paint
  if (containerWidth === 0 && cellsCount < 500) return defaultCellsGap;
  for (const gap of [defaultCellsGap, smallCellsGap, 0]) {
    const neededWidth = cellsCount * slotCellMinWidth + (cellsCount - 1) * gap;
    if (neededWidth <= containerWidth) {
      return gap;
    }
  }
  return 0;
}
