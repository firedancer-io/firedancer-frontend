import { sortedIndex } from "lodash";
import { getSlotGroupLeader } from "../../utils";
import {
  ItemHeightType,
  itemHeightByType,
  type ListHelpers,
  type SlotsIndexProps,
} from "./const";
import { getHeightSum, type Counts } from "./utils";

export function getMySlotsListHelpers(
  mySlots: number[],
  ascendingLeaderSlotsSet: Set<number>,
  currentLeaderSlot: number,
  yourNextLeaderSlot: number | undefined,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
  yourLeaderSlotCounts: { past: number; current: number; future: number },
): ListHelpers {
  const totalHeight = getTotalHeight(yourLeaderSlotCounts);

  const getIndexTopOffset = (index: number) => {
    if (index === 0) return 0;

    // list shows leader slots in reverse
    const leaderStartIdx = mySlots.length - index;
    const leaderEndIdx = mySlots.length - 1;

    const countsAbove = getTypeCountsForRange(
      leaderStartIdx,
      leaderEndIdx,
      isCurrentlyLeader,
      nextLeaderSlotIndex,
      mySlots.length,
    );

    return getHeightSum(countsAbove);
  };

  const getSlotHeight = (slotGroupLeader: number): number =>
    itemHeightByType[
      getSlotHeightType(
        slotGroupLeader,
        ascendingLeaderSlotsSet,
        currentLeaderSlot,
        yourNextLeaderSlot,
      )
    ];

  return {
    totalHeight,
    offsetSnapshotCurrentSlot: currentLeaderSlot,
    yourNextLeaderSlot: yourNextLeaderSlot,
    getSlotHeight,
    getIndexTopOffset,
  };
}

/**
 * Get props for my slots list, where the list of items are comprised of
 * my leader slots in the current epoch, in descending order
 */
export function getMySlotsListProps(
  mySlots: number[] | undefined,
  ascendingLeaderSlotsSet: Set<number> | undefined,
  currentLeaderSlot: number | undefined,
  nextLeaderSlot: number | undefined,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
  yourLeaderSlotCounts:
    | { past: number; current: number; future: number }
    | undefined,
): SlotsIndexProps | undefined {
  if (mySlots == null || !yourLeaderSlotCounts) return;

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

  const listHelpers =
    currentLeaderSlot != null && ascendingLeaderSlotsSet != null
      ? getMySlotsListHelpers(
          mySlots,
          ascendingLeaderSlotsSet,
          currentLeaderSlot,
          nextLeaderSlot,
          isCurrentlyLeader,
          nextLeaderSlotIndex,
          yourLeaderSlotCounts,
        )
      : undefined;

  return {
    getSlotAtIndex,
    getIndexForSlot: getClosestIndexForSlot,
    itemsCount: mySlots.length,
    listHelpers,
  };
}

function getTotalHeight(yourLeaderSlotCounts: {
  past: number;
  current: number;
  future: number;
}): number {
  const nextFutureCount = yourLeaderSlotCounts.future > 0 ? 1 : 0;
  const nonNextFutureCount = yourLeaderSlotCounts.future - nextFutureCount;

  const counts = {
    [ItemHeightType.YourPast]: yourLeaderSlotCounts.past,
    [ItemHeightType.YourCurrent]: yourLeaderSlotCounts.current,
    [ItemHeightType.YourNextLeader]: nextFutureCount,
    [ItemHeightType.YourNonNextFuture]: nonNextFutureCount,
  };
  return getHeightSum(counts);
}

function getTypeCountsForRange(
  startLeadersIdx: number,
  endLeadersIdx: number,
  isCurrentlyLeader: boolean,
  nextLeaderSlotIndex: number | undefined,
  totalLeadersCount: number,
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
    totalLeadersCount,
  )
    ? 1
    : 0;
  const pastCount = notFutureCount - currentCount;

  const nextFutureCount = futureCount > 0 ? 1 : 0;
  const nonNextFutureCount = futureCount - nextFutureCount;

  return {
    [ItemHeightType.YourPast]: pastCount,
    [ItemHeightType.YourCurrent]: currentCount,
    [ItemHeightType.YourNextLeader]: nextFutureCount,
    [ItemHeightType.YourNonNextFuture]: nonNextFutureCount,
  };
}

function isCurrentLeaderAndInRange(
  startIdx: number,
  endIdx: number,
  nextLeaderSlotIndex: number | undefined,
  isCurrentlyLeader: boolean,
  totalLeadersCount: number,
) {
  if (!isCurrentlyLeader) return false;

  const currentIndex =
    nextLeaderSlotIndex != null
      ? nextLeaderSlotIndex - 1
      : totalLeadersCount - 1;
  if (currentIndex < 0) return false;

  return currentIndex >= startIdx && currentIndex <= endIdx;
}

function getSlotHeightType(
  slotGroupleader: number,
  yourLeaderSlotsSet: Set<number>,
  currentLeaderSlot: number,
  yourNextLeaderSlot: number | undefined,
): ItemHeightType {
  if (yourLeaderSlotsSet.has(slotGroupleader)) return ItemHeightType.NotInList;
  if (slotGroupleader < currentLeaderSlot) return ItemHeightType.YourPast;
  if (slotGroupleader === currentLeaderSlot) return ItemHeightType.YourCurrent;
  if (slotGroupleader === yourNextLeaderSlot)
    return ItemHeightType.YourNextLeader;
  return ItemHeightType.YourNonNextFuture;
}
