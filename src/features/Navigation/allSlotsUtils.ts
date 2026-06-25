import { getDefaultStore } from "jotai";
import type { Epoch } from "../../api/types";
import {
  currentSlotAtom,
  epochAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
} from "../../atoms";
import { slotsPerLeader } from "../../consts";
import { getSlotGroupLeader } from "../../utils";
import {
  OTHER_CURRENT_HEIGHT,
  OTHER_FUTURE_HEIGHT,
  OTHER_PAST_HEIGHT,
  YOUR_CURRENT_HEIGHT,
  YOUR_NEXT_LEADER_HEIGHT,
  YOUR_NON_NEXT_FUTURE_HEIGHT,
  YOUR_PAST_HEIGHT,
  type SlotsIndexProps,
} from "./const";
import { getHeightSum, type Counts } from "./utils";

const store = getDefaultStore();

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

  /**
   * Helpers that change with currentSlot changes
   */
  const getOffsetHelpers = () => {
    const currentEpoch = store.get(epochAtom);
    const currentSlot = store.get(currentSlotAtom);
    const leaderSlots = store.get(leaderSlotsAtom);

    if (!currentEpoch || currentSlot == null || !leaderSlots) return;

    const firstLeaderSlot = getSlotGroupLeader(currentEpoch.start_slot);
    const lastLeaderSlot = getSlotGroupLeader(currentEpoch.end_slot);
    const currentLeaderSlot = getSlotGroupLeader(currentSlot);
    const nextLeaderSlot = store.get(nextLeaderSlotAtom);

    const counts = getTypeCounts(
      firstLeaderSlot,
      lastLeaderSlot,
      currentLeaderSlot,
      leaderSlots,
    );
    const totalHeight = getHeightSum(counts);

    const getSlotTopOffset = (slot: number) => {
      const leaderSlot = getSlotGroupLeader(slot);

      if (leaderSlot === lastLeaderSlot) return 0;
      const slotAbove = leaderSlot + slotsPerLeader;
      const counts = getTypeCounts(
        slotAbove,
        lastLeaderSlot,
        currentLeaderSlot,
        leaderSlots,
      );
      return getHeightSum(counts);
    };

    const getIndexTopOffset = (index: number) => {
      if (index === 0) return 0;

      const slot = getSlotAtIndex(index);
      if (!slot) return;

      return getSlotTopOffset(slot);
    };

    const getSlotHeight = (anySlot: number) => {
      const slot = getSlotGroupLeader(anySlot);
      const isYours = leaderSlots.includes(slot);
      if (slot < currentLeaderSlot)
        return isYours ? YOUR_PAST_HEIGHT : OTHER_PAST_HEIGHT;
      if (slot === currentLeaderSlot)
        return isYours ? YOUR_CURRENT_HEIGHT : OTHER_CURRENT_HEIGHT;
      if (!isYours) return OTHER_FUTURE_HEIGHT;
      return slot === nextLeaderSlot
        ? YOUR_NEXT_LEADER_HEIGHT
        : YOUR_NON_NEXT_FUTURE_HEIGHT;
    };

    const getIndexHeight = (index: number) => {
      const slot = getSlotAtIndex(index);
      if (slot == null) return;
      return getSlotHeight(slot);
    };

    return {
      totalHeight,
      offsetSnapshotCurrentSlot: currentSlot,
      getSlotTopOffset,
      getSlotHeight,
      getIndexTopOffset,
      getIndexHeight,
    };
  };

  return {
    getSlotAtIndex,
    getIndexForSlot,
    itemsCount,
    getOffsetHelpers,
  };
}

/**
 * Get height of everything above (in the future) of index
 */
export function getTopOffsetAtIndex(
  index: number,
  currentLeaderSlot: number,
  leaderSlots: number[],
  getSlotAtIndex: (idx: number) => number | undefined,
) {
  const idxAbove = Math.max(0, index - 1);
  const slotAbove = getSlotAtIndex(idxAbove);
  const topSlot = getSlotAtIndex(0);

  if (slotAbove == null || topSlot == null) return;

  const counts = getTypeCounts(
    slotAbove,
    topSlot,
    currentLeaderSlot,
    leaderSlots,
  );

  return getHeightSum(counts);
}

function getTypeCounts(
  minLeaderSlot: number,
  maxLeaderSlot: number,
  currentLeaderSlot: number,
  leaderSlots: number[],
): Counts {
  let yourPastCount = 0;
  let yourCurrentCount = 0;
  let yourFutureCount = 0;
  for (const slot of leaderSlots) {
    if (slot < minLeaderSlot) continue;
    if (slot > maxLeaderSlot) break;

    if (slot < currentLeaderSlot) {
      yourPastCount++;
    } else if (slot === currentLeaderSlot) {
      yourCurrentCount++;
    } else {
      yourFutureCount++;
    }
  }

  const yourNextFutureCount = yourFutureCount > 0 ? 1 : 0;
  const yourNonNextFutureCount = yourFutureCount - yourNextFutureCount;

  const totalCount = (maxLeaderSlot - minLeaderSlot) / slotsPerLeader + 1;
  const { totalPastCount, totalCurrentCount, totalFutureCount } =
    currentLeaderSlot < minLeaderSlot
      ? {
          totalPastCount: 0,
          totalCurrentCount: 0,
          totalFutureCount: totalCount,
        }
      : currentLeaderSlot > maxLeaderSlot
        ? {
            totalPastCount: totalCount,
            totalCurrentCount: 0,
            totalFutureCount: 0,
          }
        : {
            totalPastCount:
              (currentLeaderSlot - minLeaderSlot) / slotsPerLeader,
            totalCurrentCount: 1,
            totalFutureCount:
              (maxLeaderSlot - currentLeaderSlot) / slotsPerLeader,
          };

  return {
    otherPastCount: totalPastCount - yourPastCount,
    otherCurrentCount: totalCurrentCount - yourCurrentCount,
    otherFutureCount: totalFutureCount - yourFutureCount,
    yourPastCount,
    yourCurrentCount,
    yourNextFutureCount,
    yourNonNextFutureCount,
  };
}
