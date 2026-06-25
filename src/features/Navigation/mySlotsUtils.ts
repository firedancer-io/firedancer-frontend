import { sortedIndex } from "lodash";
import { getSlotGroupLeader } from "../../utils";
import {
  YOUR_CURRENT_HEIGHT,
  YOUR_NEXT_LEADER_HEIGHT,
  YOUR_NON_NEXT_FUTURE_HEIGHT,
  YOUR_PAST_HEIGHT,
  type SlotsIndexProps,
} from "./const";
import {
  epochAtom,
  currentSlotAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
  isCurrentlyLeaderAtom,
  nextLeaderSlotIndexAtom,
} from "../../atoms";
import { getHeightSum, type Counts } from "./utils";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

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

  /**
   * Helpers that change with currentSlot changes
   */
  const getOffsetHelpers = () => {
    const currentEpoch = store.get(epochAtom);
    const currentSlot = store.get(currentSlotAtom);
    const leaderSlots = store.get(leaderSlotsAtom);

    if (!currentEpoch || currentSlot == null || !leaderSlots) return;

    const currentLeaderSlot = getSlotGroupLeader(currentSlot);
    const nextLeaderSlot = store.get(nextLeaderSlotAtom);
    const isCurrentlyLeader = store.get(isCurrentlyLeaderAtom);
    const nextLeaderSlotIndex = store.get(nextLeaderSlotIndexAtom);

    const counts = getTypeCountsForLeaderIndices(
      0,
      leaderSlots.length - 1,
      isCurrentlyLeader,
      nextLeaderSlotIndex,
    );
    const totalHeight = getHeightSum(counts);

    const getIndexTopOffset = (index: number) => {
      if (index === 0) return 0;

      // list shows leader slots in reverse
      const leaderStartIdx = leaderSlots.length - index;
      const leaderEndIdx = leaderSlots.length - 1;

      const countsAbove = getTypeCountsForLeaderIndices(
        leaderStartIdx,
        leaderEndIdx,
        isCurrentlyLeader,
        nextLeaderSlotIndex,
      );

      return getHeightSum(countsAbove);
    };

    const getSlotTopOffset = (slot: number) => {
      const idx = getClosestIndexForSlot(slot);
      return getIndexTopOffset(idx);
    };

    const getSlotHeight = (yourSlot: number) => {
      const slot = getSlotGroupLeader(yourSlot);
      if (slot < currentLeaderSlot) return YOUR_PAST_HEIGHT;
      if (slot === currentLeaderSlot) return YOUR_CURRENT_HEIGHT;
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
    getIndexForSlot: getClosestIndexForSlot,
    itemsCount: mySlots.length,
    getOffsetHelpers,
  };
}

function getTypeCountsForLeaderIndices(
  startLeadersIdx: number,
  endLeadersIdx: number,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
): Counts {
  const totalCount = endLeadersIdx - startLeadersIdx + 1;
  const futureCount =
    nextLeaderSlotIndex == null || nextLeaderSlotIndex > endLeadersIdx
      ? 0
      : nextLeaderSlotIndex < startLeadersIdx
        ? totalCount
        : endLeadersIdx - nextLeaderSlotIndex + 1;

  const notFutureCount = totalCount - futureCount;
  const currentCount = isCurrentLeaderAndInRange(
    startLeadersIdx,
    endLeadersIdx,
    nextLeaderSlotIndex,
    isCurrentlyLeader,
  )
    ? 1
    : 0;
  const pastCount = notFutureCount - currentCount;

  const nextFutureCount = futureCount > 0 ? 1 : 0;
  const nonNextFutureCount = futureCount - nextFutureCount;

  return {
    otherPastCount: 0,
    otherCurrentCount: 0,
    otherFutureCount: 0,
    yourPastCount: pastCount,
    yourCurrentCount: currentCount,
    yourNextFutureCount: nextFutureCount,
    yourNonNextFutureCount: nonNextFutureCount,
  };
}

function isCurrentLeaderAndInRange(
  startIdx: number,
  endIdx: number,
  nextLeaderSlotIndex: number | undefined,
  isCurrentlyLeader: boolean,
) {
  if (!isCurrentlyLeader || nextLeaderSlotIndex == null) return false;

  const currentIndex = nextLeaderSlotIndex - 1;
  if (currentIndex < 0) return false;

  return currentIndex >= startIdx && currentIndex <= endIdx;
}
