import { sortedIndex } from "lodash";
import { getSlotGroupLeader } from "../../utils";
import {
  YOUR_CURRENT_HEIGHT,
  YOUR_NEXT_LEADER_HEIGHT,
  YOUR_NON_NEXT_FUTURE_HEIGHT,
  YOUR_PAST_HEIGHT,
  type OffsetHelpers,
  type SlotsIndexProps,
} from "./const";
import { getHeightSum, type Counts } from "./utils";

export function getMySlotsOffsetHelpers(
  mySlots: number[],
  currentSlot: number,
  nextLeaderSlot: number | undefined,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
  getSlotAtIndex: (index: number) => number | undefined,
  getClosestIndexForSlot: (slot: number) => number,
): OffsetHelpers {
  const currentLeaderSlot = getSlotGroupLeader(currentSlot);

  const counts = getTypeCountsForLeaderIndices(
    0,
    mySlots.length - 1,
    isCurrentlyLeader,
    nextLeaderSlotIndex,
  );
  const totalHeight = getHeightSum(counts);

  const getIndexTopOffset = (index: number) => {
    if (index === 0) return 0;

    // list shows leader slots in reverse
    const leaderStartIdx = mySlots.length - index;
    const leaderEndIdx = mySlots.length - 1;

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
}

/**
 * Get props for my slots list, where the list of items are comprised of
 * my leader slots in the current epoch, in descending order
 */
export function getMySlotsListProps(
  mySlots: number[] | undefined,
  currentSlot: number | undefined,
  nextLeaderSlot: number | undefined,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
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

  const offsetHelpers =
    currentSlot != null
      ? getMySlotsOffsetHelpers(
          mySlots,
          currentSlot,
          nextLeaderSlot,
          isCurrentlyLeader,
          nextLeaderSlotIndex,
          getSlotAtIndex,
          getClosestIndexForSlot,
        )
      : undefined;

  return {
    getSlotAtIndex,
    getIndexForSlot: getClosestIndexForSlot,
    itemsCount: mySlots.length,
    offsetHelpers,
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
