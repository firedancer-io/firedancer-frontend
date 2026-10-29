import { useAtomValue } from "jotai";
import {
  completedSlotAtom,
  finalizedSlotAtom,
  isAlpenglowAtom,
  notarizedSlotAtom,
  optimisticallyConfirmedSlotAtom,
  rootSlotAtom,
} from "../../../api/atoms";
import type { SlotLevel } from "../../../api/types";

/**
 * Derive a slot's confirmation level from the global slot atoms, instead of the
 * slot query.
 */
export function useSlotLevel(slot: number, skipped: boolean): SlotLevel {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const rootSlot = useAtomValue(rootSlotAtom);
  const completedSlot = useAtomValue(completedSlotAtom);
  const optimisticallyConfirmedSlot = useAtomValue(
    optimisticallyConfirmedSlotAtom,
  );
  const notarizedSlot = useAtomValue(notarizedSlotAtom);
  const finalizedSlot = useAtomValue(finalizedSlotAtom);

  if (isAlpenglow) {
    if (finalizedSlot !== undefined && slot <= finalizedSlot) {
      return skipped ? "skipped" : "finalized";
    }
    if (notarizedSlot !== undefined && slot <= notarizedSlot) {
      return skipped ? "skip_notarized" : "notarized";
    }
    if (completedSlot !== undefined && slot <= completedSlot) {
      return "completed";
    }
    return "incomplete";
  }

  if (skipped) return "skipped";
  if (rootSlot !== undefined && slot <= rootSlot) return "rooted";
  if (
    optimisticallyConfirmedSlot !== undefined &&
    slot <= optimisticallyConfirmedSlot
  ) {
    return "optimistically_confirmed";
  }
  if (completedSlot !== undefined && slot <= completedSlot) return "completed";
  return "incomplete";
}
