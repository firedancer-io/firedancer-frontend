import {
  YOUR_PAST_HEIGHT,
  OTHER_PAST_HEIGHT,
  YOUR_CURRENT_HEIGHT,
  OTHER_CURRENT_HEIGHT,
  OTHER_FUTURE_HEIGHT,
  YOUR_NEXT_LEADER_HEIGHT,
  YOUR_NON_NEXT_FUTURE_HEIGHT,
  MAX_GROUP_HEIGHT,
  MIN_GROUP_HEIGHT,
} from "./const";

export interface Counts {
  otherPastCount: number;
  otherCurrentCount: number;
  otherFutureCount: number;
  yourPastCount: number;
  yourCurrentCount: number;
  yourNextFutureCount: number;
  yourNonNextFutureCount: number;
}

export function getHeightSum({
  otherPastCount,
  otherCurrentCount,
  otherFutureCount,
  yourPastCount,
  yourCurrentCount,
  yourNextFutureCount,
  yourNonNextFutureCount,
}: Counts) {
  return (
    otherPastCount * OTHER_PAST_HEIGHT +
    otherCurrentCount * OTHER_CURRENT_HEIGHT +
    otherFutureCount * OTHER_FUTURE_HEIGHT +
    yourPastCount * YOUR_PAST_HEIGHT +
    yourCurrentCount * YOUR_CURRENT_HEIGHT +
    yourNextFutureCount * YOUR_NEXT_LEADER_HEIGHT +
    yourNonNextFutureCount * YOUR_NON_NEXT_FUTURE_HEIGHT
  );
}

/**
 * Find first item whose top offset is >= scrollTop
 */
export function findMinVisibleIdx(
  scrollTop: number,
  totalCount: number,
  getTopOffsetAtIdx: (idx: number) => number | undefined,
) {
  let lo = Math.max(0, Math.floor(scrollTop / MAX_GROUP_HEIGHT));
  let hi = Math.min(
    totalCount - 1,
    Math.max(lo, Math.ceil(scrollTop / MIN_GROUP_HEIGHT)),
  );
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const offsetAtIdx = getTopOffsetAtIdx(mid);
    if (offsetAtIdx == null) return;

    if (offsetAtIdx <= scrollTop) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export enum ItemType {
  Past,
  Current,
  Future,
}

function getItemType(slot: number, currentSlot: number) {
  if (slot < currentSlot) return ItemType.Past;
  if (slot === currentSlot) return ItemType.Current;
  return ItemType.Future;
}

export interface BaseItemInfo {
  idx: number;
  slot: number;
  bottomOffset: number;
  height: number;
  type: ItemType;
}
export interface ItemInfo extends BaseItemInfo {
  topOffset: number;
  type: ItemType;
}

export function getItemInfo(
  idx: number | undefined,
  getSlotAtIndex: (idx: number) => number | undefined,
  getIndexTopOffset: (idx: number) => number | undefined,
  getSlotHeight: (slot: number) => number | undefined,
  totalListHeight: number,
  currentLeaderSlot: number,
): ItemInfo | undefined {
  if (idx == null) return;

  const slot = getSlotAtIndex(idx);
  if (slot == null) return;

  const topOffset = getIndexTopOffset(idx);
  if (topOffset == null) return;

  const height = getSlotHeight(slot);
  if (height == null) return;

  return {
    idx,
    slot,
    topOffset,
    bottomOffset: totalListHeight - topOffset - height,
    height,
    type: getItemType(slot, currentLeaderSlot),
  };
}

export function getItemBelowInfo(
  currentItem: ItemInfo,
  getSlotAtIndex: (idx: number) => number | undefined,
  getSlotHeight: (slot: number) => number | undefined,
  currentLeaderSlot: number,
): ItemInfo | undefined {
  const idx = currentItem.idx + 1;
  const slot = getSlotAtIndex(idx);
  if (slot == null) return;
  const topOffset = currentItem.topOffset + currentItem.height;
  const height = getSlotHeight(slot);
  if (height == null) return;
  const bottomOffset = currentItem.bottomOffset - height;

  return {
    idx,
    slot,
    topOffset,
    bottomOffset,
    height,
    type: getItemType(slot, currentLeaderSlot),
  };
}

export interface OffsetType {
  offset: number;
  isBottomOffset: boolean;
}

/**
 * Position past slots are offset from the bottom, and others from the top
 * to minimize position changes when current slot progresses.
 */
export function getSlotOffsetType(
  currentSlot: number,
  slot: number,
  topOffset: number,
  totalHeight: number,
): OffsetType {
  if (slot < currentSlot) {
    return {
      offset: totalHeight - topOffset,
      isBottomOffset: true,
    };
  }
  return {
    offset: topOffset,
    isBottomOffset: false,
  };
}
