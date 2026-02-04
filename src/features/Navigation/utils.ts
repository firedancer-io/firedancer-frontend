import { sortedIndex } from "lodash";
import type { Epoch } from "../../api/types";
import { slotsPerLeader } from "../../consts";
import { getSlotGroupLeader } from "../../utils";

export interface SlotsIndexProps {
  getSlotAtIndex: (index: number) => number | undefined;
  getIndexForSlot: (slot: number) => number | undefined;
  itemsCount: number;
}

/**
 * Get props for slots list, where the list of items are comprised of
 * the leader slots in the current epoch, in descending order
 */
export function getAllSlotsListProps(
  epoch: Epoch | undefined,
): SlotsIndexProps | undefined {
  if (!epoch) return;

  const numSlotsInEpoch = epoch.end_slot - epoch.start_slot + 1;
  const itemsCount = Math.ceil(numSlotsInEpoch / slotsPerLeader);

  const getIndexForSlot = (slot: number) => {
    if (slot < epoch.start_slot || slot > epoch.end_slot) return;
    return Math.trunc((epoch.end_slot - slot) / slotsPerLeader);
  };

  const getSlotAtIndex = (index: number) => {
    if (index < 0 || index >= itemsCount) return;
    return getSlotGroupLeader(epoch.end_slot - index * slotsPerLeader);
  };

  return {
    getSlotAtIndex,
    getIndexForSlot,
    itemsCount,
  };
}

/**
 * Get props for my slots list, where the list of items are comprised of
 * my leader slots in the current epoch, in descending order
 */
export function getMySlotsListProps(
  mySlots: number[] | undefined,
): SlotsIndexProps | undefined {
  if (mySlots == null) return;

  // Optimized index lookup of My slots
  const slotToIndexMapping = mySlots.reduce<Record<number, number>>(
    (acc, slot, index) => {
      acc[slot] = mySlots.length - index - 1;
      return acc;
    },
    {},
  );

  const getSlotAtIndex = (index: number) => mySlots[mySlots.length - index - 1];

  /**
   * In the items (desc value) array, get:
   *   - the exact slot index, or
   *   - the index of closest, smaller my slot leader, or if unavailable,
   *   - index 0
   */
  const getClosestIndexForSlot = (slot: number) => {
    if (slot >= mySlots[mySlots.length - 1]) return 0;

    return (
      slotToIndexMapping[getSlotGroupLeader(slot)] ??
      mySlots.length - sortedIndex(mySlots, slot) - 1
    );
  };

  return {
    getSlotAtIndex,
    getIndexForSlot: getClosestIndexForSlot,
    itemsCount: mySlots.length,
  };
}
