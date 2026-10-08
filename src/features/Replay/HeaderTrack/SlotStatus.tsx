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
import { currentSlotAtom } from "../../../atoms";
import { StatusIcon } from "../../../components/StatusIcon";

interface SlotStatusProps {
  slot: number;
  skipped: boolean;
}

/**
 * Derive slot status from various slot atoms, instead of the slot query
 */
export function SlotStatus({ slot, skipped }: SlotStatusProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const rootSlot = useAtomValue(rootSlotAtom);
  const completedSlot = useAtomValue(completedSlotAtom);
  const optimisticallyConfirmedSlot = useAtomValue(
    optimisticallyConfirmedSlotAtom,
  );
  const notarizedSlot = useAtomValue(notarizedSlotAtom);
  const finalizedSlot = useAtomValue(finalizedSlotAtom);

  const isCurrent = slot === currentSlot;

  let status: SlotLevel;
  if (isAlpenglow) {
    if (finalizedSlot !== undefined && slot <= finalizedSlot) {
      status = skipped ? "skipped" : "finalized";
    } else if (notarizedSlot !== undefined && slot <= notarizedSlot) {
      status = skipped ? "skip_notarized" : "notarized";
    } else if (completedSlot !== undefined && slot <= completedSlot) {
      status = "completed";
    } else {
      status = "incomplete";
    }
  } else if (skipped) {
    status = "skipped";
  } else if (rootSlot !== undefined && slot <= rootSlot) {
    status = "rooted";
  } else if (completedSlot !== undefined && slot <= completedSlot) {
    status = "completed";
  } else if (
    optimisticallyConfirmedSlot !== undefined &&
    slot <= optimisticallyConfirmedSlot
  ) {
    status = "optimistically_confirmed";
  } else {
    status = "incomplete";
  }

  return (
    <StatusIcon
      status={status}
      isCurrent={isCurrent}
      size="xsmall"
      isSkipped={skipped}
    />
  );
}
