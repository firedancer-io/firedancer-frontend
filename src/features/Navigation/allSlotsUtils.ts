import type { Epoch } from "../../api/types";
import { slotsPerLeader } from "../../consts";
import { getSlotGroupLeader } from "../../utils";
import {
  ItemHeightType,
  itemHeightByType,
  type ListHelpers,
  type SlotsIndexProps,
} from "./const";
import { getHeightSum, type Counts } from "./utils";

export function getAllSlotsListHelpers(
  epoch: Epoch,
  currentLeaderSlot: number,
  ascendingLeaderSlotsSet: Set<number>,
  yourNextLeaderSlot: number | undefined,
  yourLeaderSlotCounts: { past: number; current: number; future: number },
  getSlotAtIndex: (index: number) => number | undefined,
): ListHelpers {
  const firstLeaderSlot = getSlotGroupLeader(epoch.start_slot);
  const lastLeaderSlot = getSlotGroupLeader(epoch.end_slot);

  const totalHeight = getTotalHeight(
    yourLeaderSlotCounts,
    firstLeaderSlot,
    lastLeaderSlot,
    currentLeaderSlot,
  );

  const getSlotTopOffset = (slot: number) => {
    const leaderSlot = getSlotGroupLeader(slot);

    if (leaderSlot === lastLeaderSlot) return 0;
    const slotAbove = leaderSlot + slotsPerLeader;
    const counts = getTypeCounts(
      slotAbove,
      lastLeaderSlot,
      currentLeaderSlot,
      yourNextLeaderSlot,
      ascendingLeaderSlotsSet,
    );
    return getHeightSum(counts);
  };

  const getIndexTopOffset = (index: number) => {
    if (index === 0) return 0;
    const slot = getSlotAtIndex(index);
    if (slot == null) return;
    return getSlotTopOffset(slot);
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
 * Get props for slots list, where the list of items are comprised of
 * the leader slots in the current epoch, in descending order
 */
export function getAllSlotsListProps(
  epoch: Epoch | undefined,
  currentLeaderSlot: number | undefined,
  ascendingLeaderSlotsSet: Set<number> | undefined,
  nextLeaderSlot: number | undefined,
  yourLeaderSlotCounts:
    | { past: number; current: number; future: number }
    | undefined,
): SlotsIndexProps | undefined {
  if (!epoch || !yourLeaderSlotCounts) return;

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

  const listHelpers =
    currentLeaderSlot != null && ascendingLeaderSlotsSet != null
      ? getAllSlotsListHelpers(
          epoch,
          currentLeaderSlot,
          ascendingLeaderSlotsSet,
          nextLeaderSlot,
          yourLeaderSlotCounts,
          getSlotAtIndex,
        )
      : undefined;

  return {
    getSlotAtIndex,
    getIndexForSlot,
    itemsCount,
    listHelpers,
  };
}

function getTypeCountsWithYourSlots(
  yourPastCount: number,
  yourCurrentCount: number,
  yourNextFutureCount: number,
  yourNonNextFutureCount: number,
  minLeaderSlot: number,
  maxLeaderSlot: number,
  currentLeaderSlot: number,
) {
  const yourFutureCount = yourNextFutureCount + yourNonNextFutureCount;
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
    [ItemHeightType.OtherPast]: totalPastCount - yourPastCount,
    [ItemHeightType.OtherCurrent]: totalCurrentCount - yourCurrentCount,
    [ItemHeightType.OtherFuture]: totalFutureCount - yourFutureCount,
    [ItemHeightType.YourPast]: yourPastCount,
    [ItemHeightType.YourCurrent]: yourCurrentCount,
    [ItemHeightType.YourNextLeader]: yourNextFutureCount,
    [ItemHeightType.YourNonNextFuture]: yourNonNextFutureCount,
  };
}

function getTotalHeight(
  yourLeaderSlotCounts: { past: number; current: number; future: number },
  minLeaderSlot: number,
  maxLeaderSlot: number,
  currentLeaderSlot: number,
) {
  const yourPastCount = yourLeaderSlotCounts.past;
  const yourCurrentCount = yourLeaderSlotCounts.current;
  const yourNextFutureCount = yourLeaderSlotCounts.future > 0 ? 1 : 0;
  const yourNonNextFutureCount =
    yourLeaderSlotCounts.future - yourNextFutureCount;

  const counts = getTypeCountsWithYourSlots(
    yourPastCount,
    yourCurrentCount,
    yourNextFutureCount,
    yourNonNextFutureCount,
    minLeaderSlot,
    maxLeaderSlot,
    currentLeaderSlot,
  );
  return getHeightSum(counts);
}

function getTypeCounts(
  minLeaderSlot: number,
  maxLeaderSlot: number,
  currentLeaderSlot: number,
  yourNextLeaderSlot: number | undefined,
  ascendingLeaderSlotsSet: Set<number>,
): Counts {
  let yourPastCount = 0;
  let yourCurrentCount = 0;
  let yourNextFutureCount = 0;
  let yourNonNextFutureCount = 0;
  for (const slot of ascendingLeaderSlotsSet) {
    if (slot < minLeaderSlot) continue;
    if (slot > maxLeaderSlot) break;

    if (slot < currentLeaderSlot) {
      yourPastCount++;
    } else if (slot === currentLeaderSlot) {
      yourCurrentCount++;
    } else if (slot === yourNextLeaderSlot) {
      yourNextFutureCount++;
    } else {
      yourNonNextFutureCount++;
    }
  }

  return getTypeCountsWithYourSlots(
    yourPastCount,
    yourCurrentCount,
    yourNextFutureCount,
    yourNonNextFutureCount,
    minLeaderSlot,
    maxLeaderSlot,
    currentLeaderSlot,
  );
}

function getSlotHeightType(
  slotGroupleader: number,
  yourLeaderSlotsSet: Set<number>,
  currentLeaderSlot: number,
  yourNextLeaderSlot: number | undefined,
): ItemHeightType {
  const isYours = yourLeaderSlotsSet.has(slotGroupleader);

  if (slotGroupleader < currentLeaderSlot) {
    return isYours ? ItemHeightType.YourPast : ItemHeightType.OtherPast;
  }
  if (slotGroupleader === currentLeaderSlot) {
    return isYours ? ItemHeightType.YourCurrent : ItemHeightType.OtherCurrent;
  }
  if (slotGroupleader === yourNextLeaderSlot) {
    return ItemHeightType.YourNextLeader;
  }
  return isYours
    ? ItemHeightType.YourNonNextFuture
    : ItemHeightType.OtherFuture;
}
