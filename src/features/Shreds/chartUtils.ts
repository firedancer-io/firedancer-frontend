import type { TsRange } from "../WebGl/webglUtils";
import type { SlotsShreds } from "./types";

/**
 * Get slots in draw order
 * and max shreds count per slot for scaling
 */
export function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  liveShreds: SlotsShreds,
  tsRange: TsRange,
) {
  const [minDeltaTs, maxDeltaTs] = tsRange;
  const orderedSlotNumbers = [];
  let maxShreds = 0;

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

    if (slot.minEventTsDelta > maxDeltaTs) {
      // slot started after chart max X
      continue;
    }

    if (slot.completionTsDelta != null && slot.completionTsDelta < minDeltaTs) {
      // slot completed before chart min X
      continue;
    }

    orderedSlotNumbers.push(slotNumber);
    maxShreds = Math.max(maxShreds, slot.shreds.length);
  }

  return {
    maxShreds,
    orderedSlotNumbers,
  };
}
