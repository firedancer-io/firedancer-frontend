import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  currentSlotAtom,
  slotOverrideAtom,
} from "../../atoms";
import type { PropsWithChildren, ReactNode, RefObject } from "react";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { slotsListPinnedSlotOffset } from "../../consts";
import { throttle } from "lodash";
import SlotsRenderer, { MSlotsPlaceholder } from "./SlotsRenderer";
import {
  useDebouncedCallback,
  useThrottledCallback,
  type DebouncedState,
} from "use-debounce";
import { findMaxVisibleIdx, findMinVisibleIdx } from "./utils";
import type { SlotsIndexProps } from "./const";

const noop = () => {};

const OVERSCAN = 20;
const SCROLL_THROTTLE = 50;

interface VirtualSlotsListProps extends SlotsIndexProps {
  visibleWidth: number;
  visibleHeight: number;
}

export default function VirtualSlotsList({
  visibleWidth,
  visibleHeight,
  getSlotAtIndex,
  getIndexForSlot,
  itemsCount,
  getOffsetHelpers,
}: VirtualSlotsListProps) {
  const autoScroll = useAtomValue(autoScrollAtom);
  const currentSlot = useAtomValue(currentSlotAtom);
  const [scrollTop, setScrollTop] = useState<number | undefined>();

  const throttledSetScrollTop = useThrottledCallback(
    setScrollTop,
    SCROLL_THROTTLE,
    {
      trailing: true,
    },
  );

  const getUpdatedOffsetHelpers = useCallback(() => {
    return getOffsetCalcHelpers(
      getOffsetHelpers,
      getIndexForSlot,
      getSlotAtIndex,
      itemsCount,
    );
  }, [getIndexForSlot, getOffsetHelpers, getSlotAtIndex, itemsCount]);

  /**
   * strategically update offsetHelpers only during RT or when current slot is visible, to prevent
   * unnecessary list shifting
   */
  const [offsetHelpers, refreshOffsetHelpers] = useReducer(
    getUpdatedOffsetHelpers,
    undefined,
    getUpdatedOffsetHelpers,
  );

  const minVisibleIdx = useMemo(() => {
    if (scrollTop == null) return;
    return offsetHelpers?.getMinVisibleIdx(scrollTop);
  }, [offsetHelpers, scrollTop]);

  const maxVisibleIdx = useMemo(() => {
    if (scrollTop == null) return;
    return offsetHelpers?.getMaxVisibleIdx(scrollTop, visibleHeight);
  }, [offsetHelpers, scrollTop, visibleHeight]);

  // only update total height and offsets if items above you may have changed height
  const needsOffsetsRefresh = useMemo(() => {
    const prevIdx = offsetHelpers?.offsetSnapshotCurrentSlotIdx;
    if (minVisibleIdx == null || prevIdx == null) return false;
    return prevIdx >= minVisibleIdx;
  }, [minVisibleIdx, offsetHelpers?.offsetSnapshotCurrentSlotIdx]);

  useLayoutEffect(() => {
    if (needsOffsetsRefresh || autoScroll) {
      refreshOffsetHelpers();
    }
  }, [needsOffsetsRefresh, autoScroll, currentSlot]);

  const getTopOffsetToPinSlotRef = useRef<(slot: number) => number | undefined>(
    () => undefined,
  );
  const getPinnedSlotAtOffsetRef = useRef<
    (offset: number) => number | undefined
  >(() => undefined);

  if (!offsetHelpers) return;

  const {
    totalHeight,
    getTopOffsetToPinSlot,
    getPinnedSlotAtOffset,
    getTopOffset,
  } = offsetHelpers;

  getTopOffsetToPinSlotRef.current = getTopOffsetToPinSlot;
  getPinnedSlotAtOffsetRef.current = getPinnedSlotAtOffset;

  return (
    <>
      {totalHeight >= visibleHeight && (
        <MSlotsPlaceholder width={visibleWidth} height={visibleHeight} />
      )}
      <MScrollContainer
        width={visibleWidth}
        height={visibleHeight}
        onScrollTopChange={throttledSetScrollTop}
        getTopOffsetToPinSlotRef={getTopOffsetToPinSlotRef}
        getPinnedSlotAtOffsetRef={getPinnedSlotAtOffsetRef}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {minVisibleIdx != null && maxVisibleIdx != null && (
            <MItems
              minIdx={minVisibleIdx}
              maxIdx={maxVisibleIdx}
              getSlotAtIndex={getSlotAtIndex}
              getTopOffset={getTopOffset}
            />
          )}
        </div>
      </MScrollContainer>
    </>
  );
}

function getOffsetCalcHelpers(
  getOffsetHelpers: SlotsIndexProps["getOffsetHelpers"],
  getIndexForSlot: SlotsIndexProps["getIndexForSlot"],
  getSlotAtIndex: SlotsIndexProps["getSlotAtIndex"],
  itemsCount: number,
) {
  const offsetHelpers = getOffsetHelpers();
  if (!offsetHelpers) return;

  const {
    totalHeight,
    offsetSnapshotCurrentSlot,
    getSlotHeight,
    getIndexTopOffset,
  } = offsetHelpers;

  const getTopOffsetToPinSlot = (slot: number) => {
    const slotIdx = getIndexForSlot(slot);
    if (slotIdx == null) return;

    const topIdx = Math.max(0, slotIdx - slotsListPinnedSlotOffset);
    return getIndexTopOffset(topIdx);
  };

  const getPinnedSlotAtOffset = (offset: number) => {
    const topIdxAtOffset = findMinVisibleIdx(
      offset,
      itemsCount,
      getIndexTopOffset,
    );
    if (topIdxAtOffset == null) return;

    const pinnedIdx = Math.min(
      topIdxAtOffset + slotsListPinnedSlotOffset,
      itemsCount - 1,
    );
    return getSlotAtIndex(pinnedIdx);
  };

  const getTopOffset = (
    idx: number,
    prevSlot: number | null,
    prevIdxOffset: number | null,
  ) => {
    if (prevIdxOffset == null || prevSlot == null) {
      return getIndexTopOffset(idx);
    }

    const prevSlotHeight = getSlotHeight(prevSlot);
    if (prevSlotHeight == null) return;

    return prevIdxOffset + prevSlotHeight;
  };

  const getMinVisibleIdx = (scrollTop: number) => {
    return findMinVisibleIdx(scrollTop, itemsCount, getIndexTopOffset);
  };

  const getMaxVisibleIdx = (scrollTop: number, visibleHeight: number) => {
    return findMaxVisibleIdx(
      scrollTop,
      itemsCount,
      visibleHeight,
      getIndexTopOffset,
    );
  };

  return {
    totalHeight,
    offsetSnapshotCurrentSlotIdx: getIndexForSlot(offsetSnapshotCurrentSlot),
    getIndexTopOffset,
    getTopOffsetToPinSlot,
    getPinnedSlotAtOffset,
    getTopOffset,
    getMinVisibleIdx,
    getMaxVisibleIdx,
  };
}

interface ScrollContainerProps {
  width: number;
  height: number;
  getTopOffsetToPinSlotRef: RefObject<(slot: number) => number | undefined>;
  getPinnedSlotAtOffsetRef: RefObject<(offset: number) => number | undefined>;
  onScrollTopChange: (scrollTop: number) => void;
}
const MScrollContainer = memo(function ScrollContainer({
  width,
  height,
  getTopOffsetToPinSlotRef,
  getPinnedSlotAtOffsetRef,
  onScrollTopChange,
  children,
}: PropsWithChildren<ScrollContainerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  /** prevent auto scroll during manual scroll */
  const isManualScrolling = useDebouncedCallback(noop, 100);

  // Track scrollTop
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = () => onScrollTopChange(el.scrollTop);
    el.addEventListener("scroll", handler, { passive: true });

    return () => el.removeEventListener("scroll", handler);
  }, [containerRef, onScrollTopChange]);

  const scrollToSlotPinnedPosition = useCallback(
    (slot: number) => {
      const el = containerRef.current;
      if (!el) return;

      const offset = getTopOffsetToPinSlotRef.current?.(slot);
      if (offset == null) return;

      el.scrollTop = offset;
    },
    [containerRef, getTopOffsetToPinSlotRef],
  );

  // Handle manual sroll
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSlotOverride = throttle(
      () => {
        isManualScrolling();

        const slot = getPinnedSlotAtOffsetRef.current?.(container.scrollTop);
        if (slot == null) return;

        setSlotOverride(slot);
      },
      50,
      { leading: true, trailing: true },
    );

    container.addEventListener("wheel", updateSlotOverride);
    container.addEventListener("touchmove", updateSlotOverride);

    return () => {
      container.removeEventListener("wheel", updateSlotOverride);
      container.removeEventListener("touchmove", updateSlotOverride);
    };
  }, [
    containerRef,
    isManualScrolling,
    getPinnedSlotAtOffsetRef,
    setSlotOverride,
  ]);

  return (
    <>
      <MRtAutoScroll scrollToSlotPinnedPosition={scrollToSlotPinnedPosition} />
      <MScrollToSlotOverride
        scrollToSlotPinnedPosition={scrollToSlotPinnedPosition}
        isManualScrolling={isManualScrolling}
      />
      <div
        ref={containerRef}
        style={{
          width,
          height,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          position: "relative",
        }}
      >
        {children}
      </div>
    </>
  );
});

interface RTAutoScrollProps {
  scrollToSlotPinnedPosition: (slot: number) => void;
}
const MRtAutoScroll = memo(function RTAutoScroll({
  scrollToSlotPinnedPosition,
}: RTAutoScrollProps) {
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const autoScroll = useAtomValue(autoScrollAtom);

  useLayoutEffect(() => {
    if (!autoScroll || currentLeaderSlot === undefined) return;
    scrollToSlotPinnedPosition(currentLeaderSlot);
  }, [autoScroll, currentLeaderSlot, scrollToSlotPinnedPosition]);

  return null;
});

interface SlotOverrideScrollProps {
  isManualScrolling: DebouncedState<() => void>;
  scrollToSlotPinnedPosition: (slot: number) => void;
}
const MScrollToSlotOverride = memo(function SlotOverrideScroll({
  isManualScrolling,
  scrollToSlotPinnedPosition,
}: SlotOverrideScrollProps) {
  const rafIdRef = useRef<number | null>(null);
  const slotOverride = useAtomValue(slotOverrideAtom);

  useLayoutEffect(() => {
    if (slotOverride === undefined || isManualScrolling.isPending()) {
      return;
    }

    const prevRafId = rafIdRef.current;
    rafIdRef.current = requestAnimationFrame(() => {
      if (prevRafId !== null) cancelAnimationFrame(prevRafId);
      scrollToSlotPinnedPosition(slotOverride);
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isManualScrolling, scrollToSlotPinnedPosition, slotOverride]);

  return null;
});

interface ItemsProps {
  minIdx: number;
  maxIdx: number;
  getSlotAtIndex: (idx: number) => number | undefined;
  getTopOffset: (
    idx: number,
    prevSlot: number | null,
    prevIdxOffset: number | null,
  ) => number | undefined;
}
const MItems = memo(function Items({
  minIdx,
  maxIdx,
  getSlotAtIndex,
  getTopOffset,
}: ItemsProps) {
  const items: ReactNode[] = [];

  let prevIdxOffset = null;
  let prevSlot = null;
  for (let i = minIdx - OVERSCAN; i <= maxIdx + OVERSCAN; i++) {
    const slot = getSlotAtIndex(i);
    if (slot == null) continue;

    // pass in all data so the list can use the optimal way to get offset
    const offset = getTopOffset(i, prevSlot, prevIdxOffset);
    if (offset == null) continue;

    items.push(<MItem key={slot} slot={slot} offset={offset} />);
    prevIdxOffset = offset;
    prevSlot = slot;
  }

  return items;
});

interface ItemProps {
  slot: number;
  offset: number;
}
const MItem = memo(function Item({ slot, offset }: ItemProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        transform: `translateY(${offset}px)`,
        width: "100%",
      }}
    >
      <SlotsRenderer leaderSlotForGroup={slot} />
    </div>
  );
});
