import { slotsListTopPaddingIndex } from "../../consts";
import type { ItemHeightType, SlotsIndexProps } from "./const";
import { MAX_GROUP_HEIGHT, MIN_GROUP_HEIGHT, itemHeightByType } from "./const";

export type Counts = Partial<Record<ItemHeightType, number>>;

export function getHeightSum(counts: Counts) {
  let sum = 0;
  for (const [type, count] of Object.entries(counts)) {
    sum += count * itemHeightByType[type as ItemHeightType];
  }
  return sum;
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

export interface BaseItemInfo {
  idx: number;
  slot: number;
  bottomOffset: number;
  height: number;
  isPast: boolean;
}
export interface ItemInfo extends BaseItemInfo {
  topOffset: number;
}

export function getItemInfo(
  idx: number | undefined,
  currentLeaderSlot: number,
  getSlotAtIndex: (idx: number) => number | undefined,
  getIndexTopOffset: (idx: number) => number | undefined,
  getSlotHeight: (slot: number) => number | undefined,
  totalListHeight: number,
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
    isPast: slot < currentLeaderSlot,
  };
}

export function getItemBelowInfo(
  currentItem: ItemInfo,
  currentLeaderSlot: number,
  getSlotAtIndex: (idx: number) => number | undefined,
  getSlotHeight: (slot: number) => number | undefined,
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
    isPast: slot < currentLeaderSlot,
  };
}

export function getItemAboveInfo(
  currentItem: ItemInfo,
  currentLeaderSlot: number,
  getSlotAtIndex: (idx: number) => number | undefined,
  getSlotHeight: (slot: number) => number | undefined,
): ItemInfo | undefined {
  const idx = currentItem.idx - 1;
  const slot = getSlotAtIndex(idx);
  if (slot == null) return;

  const height = getSlotHeight(slot);
  if (height == null) return;

  const topOffset = currentItem.topOffset - height;
  const bottomOffset = currentItem.bottomOffset + currentItem.height;
  return {
    idx,
    slot,
    topOffset,
    bottomOffset,
    height,
    isPast: slot < currentLeaderSlot,
  };
}

export function filterStillVisibleItems(
  items: ItemInfo[],
  scrollTop: number,
  visibleHeight: number,
) {
  const visibleTop = scrollTop;
  const visibleBottom = scrollTop + visibleHeight;

  const stillVisible: ItemInfo[] = [];
  for (const item of items) {
    const itemTop = item.topOffset;
    const itemBottom = item.topOffset + item.height;

    if (itemTop < visibleBottom && itemBottom > visibleTop) {
      stillVisible.push(item);
    }
  }
  return stillVisible;
}

export function addVisibleItemsBelow(
  _nextItem: ItemInfo | undefined,
  visibleItems: ItemInfo[],
  endVisibleOffset: number,
  getItemBelow: (currentItem: ItemInfo) => ItemInfo | undefined,
) {
  let nextItem = _nextItem;
  while (nextItem && nextItem.topOffset < endVisibleOffset) {
    visibleItems.push(nextItem);
    nextItem = getItemBelow(nextItem);
  }
  return visibleItems;
}

export function addVisibleItemsAbove(
  _prevItem: ItemInfo | undefined,
  visibleItems: ItemInfo[],
  scrollTop: number,
  getItemAbove: (currentItem: ItemInfo) => ItemInfo | undefined,
) {
  let prevItem = _prevItem;
  while (prevItem && prevItem.topOffset + prevItem.height >= scrollTop) {
    visibleItems.unshift(prevItem);
    prevItem = getItemAbove(prevItem);
  }
  return visibleItems;
}

export function getInitialVisibleItems(
  scrollTop: number,
  endVisibleOffset: number,
  getItemBelow: (currentItem: ItemInfo) => ItemInfo | undefined,
  getFirstVisibleItem: (scrollTop: number) => ItemInfo | undefined,
) {
  const visibleItems: ItemInfo[] = [];
  const nextItem = getFirstVisibleItem(scrollTop);

  addVisibleItemsBelow(nextItem, visibleItems, endVisibleOffset, getItemBelow);
  return visibleItems;
}

export function getOffsetHelpers(
  listHelpers: SlotsIndexProps["listHelpers"],
  getIndexForSlot: SlotsIndexProps["getIndexForSlot"],
  getSlotAtIndex: SlotsIndexProps["getSlotAtIndex"],
  itemsCount: number,
) {
  if (!listHelpers) return;

  const {
    totalHeight,
    offsetSnapshotCurrentSlot,
    yourNextLeaderSlot,
    getSlotHeight,
    getIndexTopOffset,
  } = listHelpers;

  const getPaddedSlotTopOffset = (slot: number) => {
    const slotIdx = getIndexForSlot(slot);
    if (slotIdx == null) return;

    const topIdx = Math.max(0, slotIdx - slotsListTopPaddingIndex);
    return getIndexTopOffset(topIdx);
  };

  const getPaddedSlotAtOffset = (offset: number) => {
    const topIdxAtOffset = findMinVisibleIdx(
      offset,
      itemsCount,
      getIndexTopOffset,
    );
    if (topIdxAtOffset == null) return;

    const pinnedIdx = Math.min(
      topIdxAtOffset + slotsListTopPaddingIndex,
      itemsCount - 1,
    );
    return getSlotAtIndex(pinnedIdx);
  };

  const getMinVisibleIdx = (scrollTop: number) => {
    return findMinVisibleIdx(scrollTop, itemsCount, getIndexTopOffset);
  };

  const getFirstVisibleItem = (scrollTop: number) => {
    const firstIdx = getMinVisibleIdx(scrollTop);
    return getItemInfo(
      firstIdx,
      offsetSnapshotCurrentSlot,
      getSlotAtIndex,
      getIndexTopOffset,
      getSlotHeight,
      totalHeight,
    );
  };

  const getItemBelow = (currentItem: ItemInfo) => {
    return getItemBelowInfo(
      currentItem,
      offsetSnapshotCurrentSlot,
      getSlotAtIndex,
      getSlotHeight,
    );
  };

  const getItemAbove = (currentItem: ItemInfo) => {
    return getItemAboveInfo(
      currentItem,
      offsetSnapshotCurrentSlot,
      getSlotAtIndex,
      getSlotHeight,
    );
  };

  const updateItem = (
    item: ItemInfo,
    heightDeltaEntries: [slot: number, delta: number][],
    currentLeaderSlot: number,
  ) => {
    item.isPast = item.slot < currentLeaderSlot;
    for (const [slot, delta] of heightDeltaEntries) {
      if (slot > item.slot) {
        item.topOffset += delta;
      } else if (slot === item.slot) {
        item.height += delta;
      } else {
        item.bottomOffset += delta;
      }
    }
  };

  return {
    totalHeight,
    offsetSnapshotCurrentSlot,
    yourNextLeaderSlot,
    getPaddedSlotTopOffset,
    getPaddedSlotAtOffset,
    getFirstVisibleItem,
    getItemBelow,
    getItemAbove,
    updateItem,
  };
}

export type OffsetHelpers = ReturnType<typeof getOffsetHelpers>;
