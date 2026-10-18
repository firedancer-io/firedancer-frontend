import { getDefaultStore } from "jotai";
import type { TsRange } from "../WebGl/webglUtils";
import { SHREDS_PER_FEC_SET, SKIPPED_SLOT_DOT_DURATION_MS } from "./const";
import type { Slot, SlotsShreds } from "./types";
import { isSlotComplete } from "./dataUtils";
import { completedSlotAtom } from "../../api/atoms";

const store = getDefaultStore();

export interface SlotsWithGranularity {
  isFec: boolean;
  slotsShreds: SlotsShreds;
}

export interface DrawableSlot {
  slotNumber: number;
  slot: Slot;
  isFec: boolean;
  skipped: boolean;
}

function isSlotDrawable(slot: Slot | undefined): boolean {
  return !!slot && slot.shreds.length > 0 && slot.minEventTsDelta != null;
}

/**
 * Get the active slot, or the fallback if the active is not drawable
 */
function getPrimaryOrFallbackSlot(
  primary: SlotsWithGranularity,
  fallback: SlotsWithGranularity | undefined,
  slotNumber: number,
): { slot: Slot; isFec: boolean } | undefined {
  const primarySlot = primary.slotsShreds.slots.get(slotNumber);
  const fallbackSlot = fallback?.slotsShreds.slots.get(slotNumber);

  const primaryDrawable = isSlotDrawable(primarySlot);
  const fallbackDrawable = isSlotDrawable(fallbackSlot);

  if (!primaryDrawable && !fallbackDrawable) return undefined;
  if (!primaryDrawable) return { slot: fallbackSlot!, isFec: fallback!.isFec };
  if (!fallbackDrawable) return { slot: primarySlot!, isFec: primary.isFec };

  // both drawable: prefer a complete fallback over an incomplete primary
  if (isSlotComplete(fallbackSlot) && !isSlotComplete(primarySlot)) {
    return { slot: fallbackSlot!, isFec: fallback!.isFec };
  }
  return { slot: primarySlot!, isFec: primary.isFec };
}

/**
 * Deduped union of primary + fallback slot numbers within [min, max].
 */
function getSlotNumbersInRange(
  primary: SlotsWithGranularity,
  fallback: SlotsWithGranularity | undefined,
  minSlotNumber: number,
  maxSlotNumber: number,
): Set<number> {
  const inRange = new Set<number>();
  for (const source of [primary, fallback]) {
    if (!source) continue;
    for (const slotNumber of source.slotsShreds.slots.keys()) {
      if (slotNumber >= minSlotNumber && slotNumber <= maxSlotNumber) {
        inRange.add(slotNumber);
      }
    }
  }
  return inRange;
}

/**
 * Get slots to draw in order.
 * If the active granularity slot is missing, use the fallback slot.
 */
export function getDrawInfo(
  minSlotNumber: number,
  maxSlotNumber: number,
  primary: SlotsWithGranularity,
  fallback: SlotsWithGranularity | undefined,
  // Range to determine max visible shreds count
  visibleTsRange: TsRange,
  // Range to draw
  visibleRangeWithOverscan: TsRange,
  isSlotSkipped: (slot: Slot, slotNumber: number) => boolean,
  skippedDotMaxDuration = SKIPPED_SLOT_DOT_DURATION_MS,
  shouldHideTrailingIncompleteSlot?: (startTs: number) => boolean,
): { maxShreds: number; slots: DrawableSlot[] } {
  const [minDeltaTs, maxDeltaTs] = visibleRangeWithOverscan;
  const [visibleMinDeltaTs, visibleMaxDeltaTs] = visibleTsRange;

  const slots: DrawableSlot[] = [];
  let maxShreds = 0;

  const completedSlot = store.get(completedSlotAtom);

  // iterate cached slot keys in range to avoid scanning
  // large gaps between distant windows
  const slotNumbers = getSlotNumbersInRange(
    primary,
    fallback,
    minSlotNumber,
    maxSlotNumber,
  );

  for (const slotNumber of slotNumbers) {
    const slotData = getPrimaryOrFallbackSlot(primary, fallback, slotNumber);
    if (!slotData) {
      // slot has no drawable events in either source
      continue;
    }
    const { slot, isFec } = slotData;

    if (slot.minEventTsDelta == null || slot.minEventTsDelta > maxDeltaTs) {
      // slot started after chart max X including overscan
      continue;
    }

    if (slot.completionTsDelta != null && slot.completionTsDelta < minDeltaTs) {
      // slot completed before chart min X including overscan
      continue;
    }

    const skipped = isSlotSkipped(slot, slotNumber);

    if (
      completedSlot != null &&
      slot.completionTsDelta == null &&
      !skipped &&
      slotNumber <= completedSlot &&
      shouldHideTrailingIncompleteSlot?.(slot.minEventTsDelta)
    ) {
      // the slot is completed, but we don't have the completion event
      // locally. Skip drawing to prevent extending shred lines
      // if slot is far behind current live edge
      continue;
    }

    slots.push({ slotNumber, slot, isFec, skipped });

    // track maxShreds for only visible shreds. FEC takes up more height than a single shred.
    // Incomplete unskipped slots draw through the right edge.
    // Skipped slots draw dots that extend past the event
    const skippedEndTsDelta =
      slot.maxEventTsDelta == null
        ? undefined
        : slot.maxEventTsDelta + skippedDotMaxDuration;
    const slotEndTsDelta =
      slot.completionTsDelta ?? (skipped ? skippedEndTsDelta : undefined);
    const isVisible =
      slot.minEventTsDelta <= visibleMaxDeltaTs &&
      (slotEndTsDelta == null || slotEndTsDelta >= visibleMinDeltaTs);

    if (isVisible) {
      const height = isFec
        ? slot.shreds.length * SHREDS_PER_FEC_SET
        : slot.shreds.length;
      maxShreds = Math.max(maxShreds, height);
    }
  }

  // draw in ascending slot order (bigger slots paint on top)
  slots.sort((a, b) => a.slotNumber - b.slotNumber);

  return { maxShreds, slots };
}
