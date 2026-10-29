import { useAtomValue } from "jotai";
import { currentSlotAtom } from "../../../atoms";
import { StatusIcon } from "../../../components/StatusIcon";
import { useSlotLevel } from "./useSlotLevel";

interface SlotStatusProps {
  slot: number;
  skipped: boolean;
}

/**
 * Derive slot status from various slot atoms, instead of the slot query
 */
export function SlotStatus({ slot, skipped }: SlotStatusProps) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const status = useSlotLevel(slot, skipped);
  const isCurrent = slot === currentSlot;

  return (
    <StatusIcon
      status={status}
      isCurrent={isCurrent}
      size="xsmall"
      isSkipped={skipped}
    />
  );
}
