import type { Epoch } from "../../api/types";
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
  type OffsetHelpers,
  type SlotsIndexProps,
} from "./const";
import { getHeightSum, type Counts } from "./utils";

export function getAllSlotsOffsetHelpers(
  epoch: Epoch,
  currentSlot: number,
  ascendingLeaderSlotsSet: Set<number>,
  nextLeaderSlot: number | undefined,
  getSlotAtIndex: (index: number) => number | undefined,
): OffsetHelpers {
  const firstLeaderSlot = getSlotGroupLeader(epoch.start_slot);
  const lastLeaderSlot = getSlotGroupLeader(epoch.end_slot);
  const currentLeaderSlot = getSlotGroupLeader(currentSlot);

  const counts = getTypeCounts(
    firstLeaderSlot,
    lastLeaderSlot,
    currentLeaderSlot,
    nextLeaderSlot,
    ascendingLeaderSlotsSet,
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
      nextLeaderSlot,
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

  const getSlotHeight = (anySlot: number) => {
    const slot = getSlotGroupLeader(anySlot);
    const isYours = ascendingLeaderSlotsSet.has(slot);
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
}

/**
 * Get props for slots list, where the list of items are comprised of
 * the leader slots in the current epoch, in descending order
 */
export function getAllSlotsListProps(
  epoch: Epoch | undefined,
  currentSlot: number | undefined,
  ascendingLeaderSlotsSet: Set<number> | undefined,
  nextLeaderSlot: number | undefined,
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

  const offsetHelpers =
    currentSlot != null && ascendingLeaderSlotsSet != null
      ? getAllSlotsOffsetHelpers(
          epoch,
          currentSlot,
          ascendingLeaderSlotsSet,
          nextLeaderSlot,
          getSlotAtIndex,
        )
      : undefined;

  return {
    getSlotAtIndex,
    getIndexForSlot,
    itemsCount,
    offsetHelpers,
  };
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
    otherPastCount: totalPastCount - yourPastCount,
    otherCurrentCount: totalCurrentCount - yourCurrentCount,
    otherFutureCount: totalFutureCount - yourFutureCount,
    yourPastCount,
    yourCurrentCount,
    yourNextFutureCount,
    yourNonNextFutureCount,
  };
}
