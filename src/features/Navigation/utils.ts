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

/**
 * Find last item whose bottom offset is <= scrollBottom
 */
export function findMaxVisibleIdx(
  scrollTop: number,
  totalCount: number,
  visibleHeight: number,
  getTopOffsetAtIdx: (idx: number) => number | undefined,
) {
  const scrollBottom = scrollTop + visibleHeight;

  let lo = Math.max(0, Math.floor(scrollBottom / MAX_GROUP_HEIGHT));
  let hi = Math.min(
    totalCount - 1,
    Math.max(lo, Math.ceil(scrollBottom / MIN_GROUP_HEIGHT)),
  );
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const offsetAtIndex = getTopOffsetAtIdx(mid);
    if (offsetAtIndex == null) return;

    if (offsetAtIndex <= scrollBottom) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}
