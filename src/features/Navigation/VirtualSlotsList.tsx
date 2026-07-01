import { useAtomValue, useSetAtom } from "jotai";
import {
  autoScrollAtom,
  currentLeaderSlotAtom,
  slotOverrideAtom,
} from "../../atoms";
import type { PropsWithChildren, ReactNode, RefObject } from "react";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { slotsListTopPaddingIndex } from "../../consts";
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
  offsetHelpers,
}: VirtualSlotsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousTotalHeightRef = useRef<number | undefined>();
  const [scrollTop, setScrollTop] = useState<number | undefined>();

  const throttledSetScrollTop = useThrottledCallback(
    (value: number) => {
      setScrollTop(value);
    },
    SCROLL_THROTTLE,
    { trailing: true },
  );

  const calcHelpers = useMemo(
    () =>
      getCalcHelpers(
        offsetHelpers,
        getIndexForSlot,
        getSlotAtIndex,
        itemsCount,
      ),
    [offsetHelpers, getIndexForSlot, getSlotAtIndex, itemsCount],
  );

  // prevent visual shifting on height change as current slot progresses
  useLayoutEffect(() => {
    const newTotalHeight = calcHelpers?.totalHeight;
    const previousTotalHeight = previousTotalHeightRef.current;
    previousTotalHeightRef.current = newTotalHeight;

    if (
      !containerRef.current ||
      previousTotalHeight == null ||
      newTotalHeight == null ||
      previousTotalHeight === newTotalHeight
    )
      return;

    const currentSlotOffset = calcHelpers?.offsetSnapshotCurrentSlotOffset;

    if (
      currentSlotOffset == null ||
      containerRef.current.scrollTop <= currentSlotOffset
    )
      return;

    const newScrollTop =
      containerRef.current.scrollTop + (newTotalHeight - previousTotalHeight);
    containerRef.current.scrollTop = newScrollTop;
    setScrollTop(newScrollTop);
  }, [calcHelpers]);

  const minVisibleIdx = useMemo(() => {
    if (scrollTop == null) return;
    return calcHelpers?.getMinVisibleIdx(scrollTop);
  }, [calcHelpers, scrollTop]);

  const maxVisibleIdx = useMemo(() => {
    if (scrollTop == null) return;
    return calcHelpers?.getMaxVisibleIdx(scrollTop, visibleHeight);
  }, [calcHelpers, scrollTop, visibleHeight]);

  const getPaddedSlotTopOffsetRef = useRef<
    (slot: number) => number | undefined
  >(() => undefined);
  const getPaddedSlotAtOffsetRef = useRef<
    (offset: number) => number | undefined
  >(() => undefined);

  getPaddedSlotTopOffsetRef.current = (slot: number) => {
    return calcHelpers?.getPaddedSlotTopOffset(slot);
  };

  if (!calcHelpers) return;

  const { totalHeight, getTopOffset, getPaddedSlotAtOffset } = calcHelpers;

  getPaddedSlotAtOffsetRef.current = getPaddedSlotAtOffset;

  return (
    <>
      {totalHeight >= visibleHeight && (
        <MSlotsPlaceholder width={visibleWidth} height={visibleHeight} />
      )}
      <MScrollContainer
        width={visibleWidth}
        height={visibleHeight}
        containerRef={containerRef}
        onScrollTopChange={throttledSetScrollTop}
        getPaddedSlotTopOffsetRef={getPaddedSlotTopOffsetRef}
        getPaddedSlotAtOffsetRef={getPaddedSlotAtOffsetRef}
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

function getCalcHelpers(
  offsetHelpers: SlotsIndexProps["offsetHelpers"],
  getIndexForSlot: SlotsIndexProps["getIndexForSlot"],
  getSlotAtIndex: SlotsIndexProps["getSlotAtIndex"],
  itemsCount: number,
) {
  if (!offsetHelpers) return;

  const {
    totalHeight,
    offsetSnapshotCurrentSlot,
    getSlotHeight,
    getIndexTopOffset,
  } = offsetHelpers;

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

  const offsetSnapshotCurrentSlotIdx = getIndexForSlot(
    offsetSnapshotCurrentSlot,
  );
  const offsetSnapshotCurrentSlotOffset =
    offsetSnapshotCurrentSlotIdx != null
      ? getIndexTopOffset(offsetSnapshotCurrentSlotIdx)
      : undefined;

  return {
    totalHeight,
    offsetSnapshotCurrentSlotOffset,
    getIndexTopOffset,
    getPaddedSlotTopOffset,
    getPaddedSlotAtOffset,
    getTopOffset,
    getMinVisibleIdx,
    getMaxVisibleIdx,
  };
}

interface ScrollContainerProps {
  width: number;
  height: number;
  containerRef: RefObject<HTMLDivElement>;
  getPaddedSlotTopOffsetRef: RefObject<(slot: number) => number | undefined>;
  getPaddedSlotAtOffsetRef: RefObject<(offset: number) => number | undefined>;
  onScrollTopChange: (scrollTop: number) => void;
}
const MScrollContainer = memo(function ScrollContainer({
  width,
  height,
  containerRef,
  getPaddedSlotTopOffsetRef: refreshAndGetPaddedSlotTopOffsetRef,
  getPaddedSlotAtOffsetRef,
  onScrollTopChange,
  children,
}: PropsWithChildren<ScrollContainerProps>) {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  /** prevent auto scroll during manual scroll */
  const isManualScrolling = useDebouncedCallback(noop, 100);

  // Track scrollTop
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = () => {
      onScrollTopChange(el.scrollTop);
    };
    el.addEventListener("scroll", handler, { passive: true });

    return () => el.removeEventListener("scroll", handler);
  }, [containerRef, onScrollTopChange]);

  const scrollToSlotPinnedPosition = useCallback(
    (slot: number) => {
      const el = containerRef.current;
      if (!el) return;

      const offset = refreshAndGetPaddedSlotTopOffsetRef.current?.(slot);
      if (offset == null) return;

      el.scrollTop = offset;
    },
    [containerRef, refreshAndGetPaddedSlotTopOffsetRef],
  );

  // Handle manual sroll
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSlotOverride = throttle(
      () => {
        isManualScrolling();

        const slot = getPaddedSlotAtOffsetRef.current?.(container.scrollTop);
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
      updateSlotOverride.cancel();
    };
  }, [
    containerRef,
    isManualScrolling,
    getPaddedSlotAtOffsetRef,
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

    rafIdRef.current = requestAnimationFrame(() => {
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
        // prevent browser snapping to document's pixel grid
        willChange: "transform",
      }}
    >
      <SlotsRenderer leaderSlotForGroup={slot} />
    </div>
  );
});
